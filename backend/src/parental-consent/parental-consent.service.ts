import { ConflictException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { calculateAge, parseBirthDate } from './birth-date.js';
import { adultAgeFor, consentAgeFor, normalizeCountryCode } from './minor-age.js';
import { CURRENT_TERMS_VERSION } from '../common/legal/terms.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';
import { ParentalConsentStatus, Role } from '../generated/prisma/enums.js';
import { appError } from '../common/i18n/app-error.js';
import type { SupportedLocale } from '../common/i18n/locales.js';
import { childLocale, consentEmail, type ConsentPageState } from './consent-texts.js';

// 동의가 필요한 나이는 국가별(minor-age.ts) — 가입 때 저장한 기기 지역(User.countryCode) 기준
const CONSENT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;


@Injectable()
export class ParentalConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 성인만 가입(기본, 2026-09-29 사용자 결정) — 부모가 진짜 부모인지 확인할 방법이 마땅치 않고 나라마다 요건이 달라서,
   * 출시는 성년 이상만 받음. ADULTS_ONLY=false로 두면 예전 부모 이메일 동의 방식으로 돌아감(코드 유지).
   */
  private get adultsOnly(): boolean {
    return this.configService.get<string>('ADULTS_ONLY') !== 'false';
  }

  // 앱이 로그인 직후 온보딩(약관 동의 → 생년월일 → (성년 미만이면 가입 불가 | 부모 동의 대기) → 닉네임)을 보여줘야 하는지 판단
  async getOnboardingStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { birthDate: true, parentalConsentStatus: true, role: true, nickname: true, termsVersion: true, countryCode: true },
    });
    // 생년월일 화면 안내 문구·가입 불가 화면에 쓸 기준 나이
    const minimumAge = this.adultsOnly ? adultAgeFor(user.countryCode) : null;
    // 약관 동의는 모든 계정, 연령 확인·닉네임은 구독하는 팬(USER)에게만 — 배우 본인/소속사/운영자 계정은 그 뒤 온보딩 없이 진입
    const needsTerms = user.termsVersion !== CURRENT_TERMS_VERSION;
    if (user.role !== Role.USER) {
      return { needsTerms, needsBirthDate: false, needsNickname: false, parentalConsentStatus: user.parentalConsentStatus, minimumAge };
    }
    return {
      needsTerms,
      needsBirthDate: !user.birthDate,
      needsNickname: !user.nickname,
      parentalConsentStatus: user.parentalConsentStatus,
      minimumAge,
    };
  }

  // 약관·개인정보 수집 동의 기록 — 버전과 시각을 남김(유료 서비스라 "언제 어떤 약관에 동의했는지" 증빙용).
  // 가입 첫 단계라 기기 지역·플랫폼도 같이 받아둠(미성년 기준·통계). 이미 있으면(약관 재동의) 덮어쓰지 않음.
  async acceptTerms(userId: string, version: string, device: { countryCode?: string; platform?: string } = {}) {
    if (version !== CURRENT_TERMS_VERSION) {
      throw new BadRequestException(appError('TERMS_UPDATED'));
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { countryCode: true, signupPlatform: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        termsVersion: version,
        termsAcceptedAt: new Date(),
        countryCode: user.countryCode ?? normalizeCountryCode(device.countryCode),
        signupPlatform: user.signupPlatform ?? (device.platform?.slice(0, 20) || null),
      },
    });
    return this.getOnboardingStatus(userId);
  }

  // 온보딩에서 생년월일을 받으면 여기서 국가별 기준 나이(한국 14세, 태국 20세 등) 미만인지 판정 — 미만이면
  // 부모 동의 대기 상태로 전환. 한 번 입력하면 다시 못 바꿈 — 바꿀 수 있으면 미성년자가 나이를 고쳐 부모 동의를
  // 건너뛸 수 있음
  // (잘못 입력한 경우는 운영자가 확인 후 DB에서 정정, STATUS "출시 전 확정할 정책").
  async setBirthDate(userId: string, raw: string) {
    const birthDate = parseBirthDate(raw);
    const existing = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { birthDate: true, countryCode: true },
    });
    if (existing.birthDate) {
      throw new ConflictException(appError('BIRTH_DATE_ONCE'));
    }
    const age = calculateAge(birthDate, new Date());
    const status = this.adultsOnly
      ? age < adultAgeFor(existing.countryCode)
        ? ParentalConsentStatus.UNDERAGE
        : ParentalConsentStatus.NOT_REQUIRED
      : age < consentAgeFor(existing.countryCode)
        ? ParentalConsentStatus.PENDING
        : ParentalConsentStatus.NOT_REQUIRED;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { birthDate, parentalConsentStatus: status },
      select: { parentalConsentStatus: true },
    });
    return user;
  }

  async requestConsent(userId: string, parentEmail: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.parentalConsentStatus !== ParentalConsentStatus.PENDING) {
      throw new BadRequestException(appError('CONSENT_NOT_REQUIRED'));
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
    // 링크엔 언어를 넣지 않음 — 페이지는 부모 브라우저 언어를 먼저 따름(메일은 자녀 앱 언어 + 영어)
    const confirmUrl = `${apiPublicUrl}/parental-consent/confirm?token=${token}`;
    const { subject, html } = consentEmail(childLocale(user), confirmUrl);
    await this.emailService.send(parentEmail, subject, html);
  }

  /**
   * 부모가 링크를 열었을 때 보여줄 상태 — 여기선 동의 처리를 하지 않음(메일 보안 검사기가 링크를 미리 열어 보면
   * 부모가 누르지 않았는데 동의되는 문제가 있어서, 동의는 페이지의 "동의합니다" 버튼(POST)으로만).
   * childLocale은 부모 브라우저 언어를 모를 때 쓸 자녀 계정 언어.
   */
  async consentPageState(token: string | undefined): Promise<{ state: ConsentPageState; childLocale: SupportedLocale | null }> {
    const consent = token
      ? await this.prisma.parentalConsent.findUnique({
          where: { token },
          select: { expiresAt: true, confirmedAt: true, user: { select: { locale: true, countryCode: true } } },
        })
      : null;
    if (!consent) return { state: 'invalid', childLocale: null };
    const locale = childLocale(consent.user);
    if (consent.confirmedAt) return { state: 'done', childLocale: locale };
    return { state: consent.expiresAt < new Date() ? 'invalid' : 'ask', childLocale: locale };
  }

  // 부모가 동의 페이지에서 "동의합니다"를 눌렀을 때 — 인증 불필요(토큰 자체가 자격증명)
  async confirm(token: string): Promise<void> {
    const consent = await this.prisma.parentalConsent.findUnique({ where: { token } });
    if (!consent || consent.expiresAt < new Date()) {
      throw new BadRequestException(appError('CONSENT_LINK_INVALID'));
    }
    // 이미 동의했으면(버튼을 두 번 누름 등) 그대로 완료 — 동의 시각을 덮어쓰지 않음
    if (consent.confirmedAt) return;

    await this.prisma.$transaction([
      this.prisma.parentalConsent.update({ where: { token }, data: { confirmedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: consent.userId },
        data: { parentalConsentStatus: ParentalConsentStatus.APPROVED },
      }),
    ]);
  }
}
