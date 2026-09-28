import { ConflictException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { calculateAge, parseBirthDate } from './birth-date.js';
import { CURRENT_TERMS_VERSION } from '../common/legal/terms.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';
import { ParentalConsentStatus, Role } from '../generated/prisma/enums.js';

// 한국 개인정보보호법 기준 — 만 14세 미만은 법정대리인 동의 필요 (Bubble도 같은 방식)
const MINIMUM_AGE_WITHOUT_CONSENT = 14;
const CONSENT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;


@Injectable()
export class ParentalConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  // 앱이 로그인 직후 온보딩(약관 동의 → 생년월일 → 부모 동의 대기 → 닉네임)을 보여줘야 하는지 판단하는 데 씀
  async getOnboardingStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { birthDate: true, parentalConsentStatus: true, role: true, nickname: true, termsVersion: true },
    });
    // 약관 동의는 모든 계정, 연령 확인·닉네임은 구독하는 팬(USER)에게만 — 배우 본인/소속사/운영자 계정은 그 뒤 온보딩 없이 진입
    const needsTerms = user.termsVersion !== CURRENT_TERMS_VERSION;
    if (user.role !== Role.USER) {
      return { needsTerms, needsBirthDate: false, needsNickname: false, parentalConsentStatus: user.parentalConsentStatus };
    }
    return {
      needsTerms,
      needsBirthDate: !user.birthDate,
      needsNickname: !user.nickname,
      parentalConsentStatus: user.parentalConsentStatus,
    };
  }

  // 약관·개인정보 수집 동의 기록 — 버전과 시각을 남김(유료 서비스라 "언제 어떤 약관에 동의했는지" 증빙용)
  async acceptTerms(userId: string, version: string) {
    if (version !== CURRENT_TERMS_VERSION) {
      throw new BadRequestException('약관이 새로 바뀌었어요. 앱을 다시 열어 최신 약관을 확인해 주세요.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { termsVersion: version, termsAcceptedAt: new Date() },
    });
    return this.getOnboardingStatus(userId);
  }

  // 온보딩에서 생년월일을 받으면 여기서 만 14세 미만인지 판정 — 미만이면 부모 동의 대기 상태로 전환.
  // 한 번 입력하면 다시 못 바꿈 — 바꿀 수 있으면 14세 미만이 나이를 고쳐 부모 동의를 건너뛸 수 있음
  // (잘못 입력한 경우는 운영자가 확인 후 DB에서 정정, STATUS "출시 전 확정할 정책").
  async setBirthDate(userId: string, raw: string) {
    const birthDate = parseBirthDate(raw);
    const existing = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { birthDate: true } });
    if (existing.birthDate) {
      throw new ConflictException('생년월일은 한 번만 입력할 수 있어요. 잘못 입력했다면 고객센터로 문의해 주세요.');
    }
    const requiresConsent = calculateAge(birthDate, new Date()) < MINIMUM_AGE_WITHOUT_CONSENT;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        birthDate,
        parentalConsentStatus: requiresConsent
          ? ParentalConsentStatus.PENDING
          : ParentalConsentStatus.NOT_REQUIRED,
      },
      select: { parentalConsentStatus: true },
    });
    return user;
  }

  async requestConsent(userId: string, parentEmail: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.parentalConsentStatus !== ParentalConsentStatus.PENDING) {
      throw new BadRequestException('법정대리인 동의가 필요한 계정이 아니에요.');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CONSENT_TOKEN_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { parentEmail } }),
      this.prisma.parentalConsent.upsert({
        where: { userId },
        update: { token, expiresAt, confirmedAt: null },
        create: { userId, token, expiresAt },
      }),
    ]);

    const apiPublicUrl = this.configService.getOrThrow<string>('API_PUBLIC_URL');
    const confirmUrl = `${apiPublicUrl}/parental-consent/confirm?token=${token}`;
    await this.emailService.send(
      parentEmail,
      'Toffee 자녀 계정 이용 동의 요청',
      `<p>자녀분이 Toffee 서비스 가입을 위해 법정대리인 동의를 요청했어요.</p>
       <p>아래 링크를 눌러 동의를 완료해주세요(7일 내 유효):</p>
       <p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
    );
  }

  // 부모가 이메일 링크를 클릭했을 때 — 인증 불필요(토큰 자체가 자격증명)
  async confirm(token: string): Promise<void> {
    const consent = await this.prisma.parentalConsent.findUnique({ where: { token } });
    if (!consent || consent.expiresAt < new Date()) {
      throw new BadRequestException('유효하지 않거나 만료된 동의 링크예요.');
    }

    await this.prisma.$transaction([
      this.prisma.parentalConsent.update({ where: { token }, data: { confirmedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: consent.userId },
        data: { parentalConsentStatus: ParentalConsentStatus.APPROVED },
      }),
    ]);
  }
}
