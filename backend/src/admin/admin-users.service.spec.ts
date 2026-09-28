import { describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';
import { translateError } from '../common/i18n/error-messages.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';

describe('운영자 제재 — 사유·작업 기록', () => {
  it('정지하면 사유를 저장하고 작업 기록을 남김', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'u1' });
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new AdminUsersService({ user: { update } } as unknown as PrismaService, { record } as unknown as AuditService);
    const until = new Date('2026-10-01T00:00:00Z');
    await service.suspend('admin-1', 'u1', until, { category: 'ABUSE', note: ' 반복 욕설 ' });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'SUSPENDED', sanctionCategory: 'ABUSE', sanctionNote: '반복 욕설' });
    expect(record).toHaveBeenCalledWith('admin-1', 'USER_SUSPEND', 'USER', 'u1', expect.objectContaining({ category: 'ABUSE' }));
  });

  it('당사자 안내 문구에 사유 분류가 받는 사람 언어로 붙음(메모는 안 나감)', () => {
    expect(translateError('ACCOUNT_BANNED', 'th', { reason: 'SPAM' })).toBe('บัญชีนี้ถูกจำกัดการใช้งาน เหตุผล: สแปมหรือโฆษณา');
    expect(translateError('ACCOUNT_BANNED', 'ko')).toBe('이용이 제한된 계정이에요.');
  });
});
