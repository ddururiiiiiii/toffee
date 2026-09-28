import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { AuthProvider } from '../generated/prisma/enums.js';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ModerationService } from '../moderation/moderation.service.js';

function setup() {
  const prisma = {
    authIdentity: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'victim', role: 'USER' }),
      create: vi.fn().mockResolvedValue({ id: 'new', role: 'USER' }),
    },
  };
  const service = new AuthService({ get: () => undefined } as unknown as ConfigService, {} as JwtService, prisma as unknown as PrismaService, {} as ModerationService);
  return { service, prisma };
}

describe('소셜 로그인 계정 합치기', () => {
  it('확인된 이메일이면 같은 이메일 계정에 합침', async () => {
    const { service } = setup();
    await expect(
      service.findOrCreateUser(AuthProvider.GOOGLE, { providerId: 'g1', email: 'a@x.com', emailVerified: true }),
    ).resolves.toEqual({ id: 'victim', role: 'USER' });
  });

  it('확인 안 된 이메일이면 합치지도 저장하지도 않고 새 계정(남의 계정 탈취 방지)', async () => {
    const { service, prisma } = setup();
    await expect(
      service.findOrCreateUser(AuthProvider.KAKAO, { providerId: 'k1', email: 'a@x.com', emailVerified: false }),
    ).resolves.toEqual({ id: 'new', role: 'USER' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create.mock.calls[0][0].data.email).toBeUndefined();
  });
});
