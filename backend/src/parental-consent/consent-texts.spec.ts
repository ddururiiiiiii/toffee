import { describe, expect, it, vi } from 'vitest';
import { childLocale, consentEmail, consentPage, CONSENT_TEXTS } from './consent-texts.js';
import { SUPPORTED_LOCALES, matchAcceptLanguage } from '../common/i18n/locales.js';
import { ParentalConsentService } from './parental-consent.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmailService } from '../notifications/email.service.js';
import type { ConfigService } from '@nestjs/config';

describe('부모 동의 문구', () => {
  it('모든 언어에 모든 문구가 있음', () => {
    const keys = Object.keys(CONSENT_TEXTS.ko);
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) expect(CONSENT_TEXTS[locale][key as keyof typeof CONSENT_TEXTS.ko], `${locale}.${key}`).toBeTruthy();
    }
  });

  it('자녀 언어: 앱 언어 → 가입 국가 → 영어', () => {
    expect(childLocale({ locale: 'ja', countryCode: 'TH' })).toBe('ja');
    expect(childLocale({ locale: null, countryCode: 'TH' })).toBe('th');
    expect(childLocale({ locale: null, countryCode: 'tw' })).toBe('zh-Hant');
    expect(childLocale({ locale: null, countryCode: 'FR' })).toBe('en');
  });

  it('메일: 자녀 언어 + 영어(영어면 한 번만)', () => {
    const th = consentEmail('th', 'https://api/parental-consent/confirm?token=a&b');
    expect(th.subject).toBe(CONSENT_TEXTS.th.emailSubject);
    expect(th.html).toContain(CONSENT_TEXTS.th.emailButton);
    expect(th.html).toContain(CONSENT_TEXTS.en.emailButton);
    expect(th.html).toContain('token=a&amp;b');
    expect(consentEmail('en', 'x').html.split(CONSENT_TEXTS.en.emailButton).length).toBe(2);
  });

  it('페이지: 안내 상태에만 동의 버튼(POST 폼), 토큰은 이스케이프', () => {
    const ask = consentPage('ask', 'ko', 'abc"<');
    expect(ask).toContain('<form method="post"');
    expect(ask).toContain('value="abc&quot;&lt;"');
    expect(ask).toContain('<html lang="ko">');
    expect(consentPage('done', 'th')).not.toContain('<form');
    expect(consentPage('invalid', 'en')).toContain(CONSENT_TEXTS.en.invalidTitle);
  });

  it('브라우저 언어가 지원 언어가 아니면 null(자녀 언어로 넘어감)', () => {
    expect(matchAcceptLanguage('fr-FR,fr;q=0.9')).toBeNull();
    expect(matchAcceptLanguage('th-TH')).toBe('th');
  });
});

describe('ParentalConsentService 동의 페이지 상태·동의', () => {
  function setup(consent: object | null) {
    const prisma = {
      parentalConsent: { findUnique: vi.fn().mockResolvedValue(consent), update: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    return { service: new ParentalConsentService(prisma, {} as EmailService, {} as ConfigService), prisma };
  }
  const future = new Date(Date.now() + 60_000);
  const user = { locale: 'th', countryCode: 'TH' };

  it('링크를 열기만 해서는 동의되지 않음(메일 보안 검사기의 미리 열기 대비)', async () => {
    const { service, prisma } = setup({ expiresAt: future, confirmedAt: null, user });
    await expect(service.consentPageState('t')).resolves.toEqual({ state: 'ask', childLocale: 'th' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('이미 동의했으면 완료, 만료·없는 토큰은 유효하지 않음', async () => {
    await expect(setup({ expiresAt: future, confirmedAt: new Date(), user }).service.consentPageState('t')).resolves.toMatchObject({ state: 'done' });
    await expect(setup({ expiresAt: new Date(0), confirmedAt: null, user }).service.consentPageState('t')).resolves.toMatchObject({ state: 'invalid' });
    await expect(setup(null).service.consentPageState(undefined)).resolves.toEqual({ state: 'invalid', childLocale: null });
  });

  it('두 번 눌러도 동의 시각을 덮어쓰지 않음', async () => {
    const { service, prisma } = setup({ userId: 'u', expiresAt: future, confirmedAt: new Date(1) });
    await service.confirm('t');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
