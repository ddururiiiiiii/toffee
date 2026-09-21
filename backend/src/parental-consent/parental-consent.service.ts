import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';
import { ParentalConsentStatus } from '../generated/prisma/enums.js';

// 한국 개인정보보호법 기준 — 만 14세 미만은 법정대리인 동의 필요 (Bubble도 같은 방식)
const MINIMUM_AGE_WITHOUT_CONSENT = 14;
const CONSENT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function calculateAge(birthDate: Date, now: Date): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

@Injectable()
export class ParentalConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  // 앱이 로그인 직후 온보딩(생년월일 입력, 부모 동의 대기 화면)을 보여줘야 하는지 판단하는 데 씀
  async getOnboardingStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { birthDate: true, parentalConsentStatus: true },
    });
    return { needsBirthDate: !user.birthDate, parentalConsentStatus: user.parentalConsentStatus };
  }

  // 온보딩에서 생년월일을 받으면 여기서 만 14세 미만인지 판정 — 미만이면 부모 동의 대기 상태로 전환
  async setBirthDate(userId: string, birthDate: Date) {
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
