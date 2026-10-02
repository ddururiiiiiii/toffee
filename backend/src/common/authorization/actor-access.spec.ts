import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ensureIsActorSelf, roomRetired, viewableActorsWhere } from './actor-access.js';

function prismaWith(role: string, actor: unknown) {
  return {
    user: { findUniqueOrThrow: () => Promise.resolve({ role }) },
    actor: { findUnique: () => Promise.resolve(actor) },
  } as unknown as PrismaService;
}

const couple = {
  kind: 'COUPLE',
  selfUserId: null,
  coupleMembers: [{ member: { id: 'a1', selfUserId: 'u1' } }, { member: { id: 'a2', selfUserId: 'u2' } }],
};

describe('방을 대신해 행동하는 아티스트(보내기·방 이름 바꾸기)', () => {
  it('1인 방은 그 아티스트 본인만, 돌려주는 값은 그 아티스트', async () => {
    await expect(ensureIsActorSelf(prismaWith('ACTOR', { kind: 'SOLO', selfUserId: 'u1', coupleMembers: [] }), 'u1', 'a1')).resolves.toBe('a1');
    await expect(ensureIsActorSelf(prismaWith('ACTOR', { kind: 'SOLO', selfUserId: 'u1', coupleMembers: [] }), 'u2', 'a1')).rejects.toThrow();
  });

  it('CP방은 두 멤버 누구나 — 돌려주는 값은 실제로 보낸 멤버 아티스트', async () => {
    await expect(ensureIsActorSelf(prismaWith('ACTOR', couple), 'u1', 'c1')).resolves.toBe('a1');
    await expect(ensureIsActorSelf(prismaWith('ACTOR', couple), 'u2', 'c1')).resolves.toBe('a2');
    await expect(ensureIsActorSelf(prismaWith('ACTOR', couple), 'u3', 'c1')).rejects.toThrow();
  });

  it('운영자는 CP방에도 보낼 수 있지만 보낸 아티스트는 없음(null)', async () => {
    await expect(ensureIsActorSelf(prismaWith('ADMIN', couple), 'admin', 'c1')).resolves.toBeNull();
  });
});

describe('볼 수 있는 방', () => {
  it('소속사 직원은 자기 소속 아티스트 + 그 아티스트가 든 CP방', () => {
    const where = viewableActorsWhere({ id: 's1', role: 'AGENCY_STAFF' as never, agencyId: 'ag1' });
    expect(where).toEqual({
      OR: [
        { selfUserId: 's1' },
        { agencyId: 'ag1' },
        { kind: 'COUPLE', coupleMembers: { some: { member: { OR: [{ selfUserId: 's1' }, { agencyId: 'ag1' }] } } } },
      ],
    });
  });
});

describe('활동 종료', () => {
  it('CP방은 멤버 한 명이라도 종료면 종료로 취급', () => {
    expect(roomRetired({ retiredAt: null, coupleMembers: [{ member: { retiredAt: null } }, { member: { retiredAt: new Date() } }] })).toBe(true);
    expect(roomRetired({ retiredAt: null, coupleMembers: [] })).toBe(false);
  });
});
