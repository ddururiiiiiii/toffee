import { describe, expect, it, vi } from 'vitest';
import { SubscriptionsService } from './subscriptions.service.js';
import { CURRENT_TERMS_VERSION } from '../common/legal/terms.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { IapVerificationService } from './iap-verification.service.js';
import type { MediaService } from '../storage/media.service.js';

function setup(user: { termsVersion: string | null; birthDate: Date | null; parentalConsentStatus: string }) {
  const prisma = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue(user) },
    actor: { findUnique: vi.fn().mockResolvedValue({ id: 'a1', monthlyPriceCents: 9900 }) },
    subscription: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 's1' }) },
    subscriptionEvent: { create: vi.fn() },
    glCp: { findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return new SubscriptionsService(prisma, {} as IapVerificationService, {} as MediaService);
}

describe('구독 전 가입 절차 강제(서버)', () => {
  const done = { termsVersion: CURRENT_TERMS_VERSION, birthDate: new Date('2000-01-01'), parentalConsentStatus: 'NOT_REQUIRED' };

  it('약관 동의·생년월일을 건너뛴 계정은 구독 불가', async () => {
    await expect(setup({ ...done, termsVersion: null }).subscribe('u', 'a1')).rejects.toThrow('가입 절차');
    await expect(setup({ ...done, birthDate: null }).subscribe('u', 'a1')).rejects.toThrow('가입 절차');
  });

  it('부모 동의 대기 중이면 구독 불가, 절차를 마쳤으면 구독', async () => {
    await expect(setup({ ...done, parentalConsentStatus: 'PENDING' }).subscribe('u', 'a1')).rejects.toThrow('법정대리인');
    await expect(setup(done).subscribe('u', 'a1')).resolves.toMatchObject({ subscription: { id: 's1' } });
  });
});
