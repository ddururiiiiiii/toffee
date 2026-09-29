import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EmailService } from '../notifications/email.service.js';
import { ParentalConsentService } from './parental-consent.service.js';
import { adultAgeFor } from './minor-age.js';

function yearsAgo(years: number, extraDays = 0): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() - extraDays));
  return d.toISOString().slice(0, 10);
}

function setup(countryCode: string | null, adultsOnly?: string) {
  const update = vi.fn(({ data }: { data: { parentalConsentStatus: string } }) => Promise.resolve({ parentalConsentStatus: data.parentalConsentStatus }));
  const prisma = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ birthDate: null, countryCode }), update },
  } as unknown as PrismaService;
  const config = { get: (key: string) => (key === 'ADULTS_ONLY' ? adultsOnly : undefined) } as unknown as ConfigService;
  return new ParentalConsentService(prisma, {} as EmailService, config);
}

describe('성인만 가입(기본)', () => {
  it('나라별 성년 나이 — 한국 19, 태국 20, 일본 18, 모르는 나라 20', () => {
    expect(adultAgeFor('KR')).toBe(19);
    expect(adultAgeFor('th')).toBe(20);
    expect(adultAgeFor('JP')).toBe(18);
    expect(adultAgeFor(null)).toBe(20);
  });

  it('성년 생일이 지났으면 가입, 하루 모자라면 가입 불가', async () => {
    await expect(setup('KR').setBirthDate('u', yearsAgo(19))).resolves.toEqual({ parentalConsentStatus: 'NOT_REQUIRED' });
    await expect(setup('KR').setBirthDate('u', yearsAgo(19, -1))).resolves.toEqual({ parentalConsentStatus: 'UNDERAGE' });
    await expect(setup('TH').setBirthDate('u', yearsAgo(19))).resolves.toEqual({ parentalConsentStatus: 'UNDERAGE' });
  });

  it('ADULTS_ONLY=false면 예전 부모 동의 방식(한국 14세 미만만 동의 대기)', async () => {
    await expect(setup('KR', 'false').setBirthDate('u', yearsAgo(15))).resolves.toEqual({ parentalConsentStatus: 'NOT_REQUIRED' });
    await expect(setup('KR', 'false').setBirthDate('u', yearsAgo(13))).resolves.toEqual({ parentalConsentStatus: 'PENDING' });
  });
});
