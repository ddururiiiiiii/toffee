import { describe, expect, it } from 'vitest';
import { APPLE_REFUND_URL, RefundService } from './refund.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ConfigService } from '@nestjs/config';
import type { IapVerificationService } from './iap-verification.service.js';
import type { ChargeLedgerService } from '../settlements/charge-ledger.service.js';

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

interface Charge {
  id: string;
  userId: string;
  source: 'SANDBOX' | 'APPLE' | 'GOOGLE';
  storeTransactionId: string | null;
  chargedAt: Date;
  periodEnd: Date;
  refundedAt: Date | null;
  rooms: string[];
}
interface Msg {
  actorId: string;
  createdAt: Date;
  senderType: 'ARTIST' | 'FAN';
  deletedAt: Date | null;
}

/** 결제·메시지만 있는 메모리 DB — 판정·요청 규칙 확인용 */
function setup(charges: Charge[], messages: Msg[], options: { googleFails?: boolean; retired?: Record<string, Date> } = {}) {
  const requests: { chargeId: string; reason: string; status: string }[] = [];
  const googleRefunds: string[] = [];
  const db = {
    purchaseCharge: {
      findMany: async ({ where }: { where: { purchase: { userId: string }; periodEnd: { gt: Date }; chargedAt: { lte: Date } } }) =>
        charges
          .filter((c) => !c.refundedAt && c.userId === where.purchase.userId && c.periodEnd > where.periodEnd.gt && c.chargedAt <= where.chargedAt.lte)
          .map((c) => ({
            ...c,
            productName: 'Nawin',
            amountCents: 9900,
            currency: 'THB',
            allocations: c.rooms.map((roomId) => ({ roomId })),
            refundRequests: requests.filter((r) => r.chargeId === c.id).map((r) => ({ reason: r.reason, status: r.status })),
          })),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => charges.find((c) => c.id === where.id)!,
      updateMany: async ({ where, data }: { where: { id: string }; data: { refundedAt: Date } }) => {
        Object.assign(charges.find((c) => c.id === where.id)!, data);
        return { count: 1 };
      },
    },
    actor: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ retiredAt: options.retired?.[id] ?? null, coupleMembers: [] })),
    },
    message: {
      count: async ({ where }: { where: { actorId: { in: string[] }; createdAt: { gte: Date; lt: Date } } }) =>
        messages.filter(
          (m) =>
            where.actorId.in.includes(m.actorId) &&
            m.senderType === 'ARTIST' &&
            !m.deletedAt &&
            m.createdAt >= where.createdAt.gte &&
            m.createdAt < where.createdAt.lt,
        ).length,
    },
    refundRequest: {
      create: async ({ data }: { data: { chargeId: string; reason: string; status: string } }) => {
        if (requests.some((r) => r.chargeId === data.chargeId && r.reason === data.reason)) throw new Error('dup');
        requests.push(data);
      },
      upsert: async ({ create }: { create: { chargeId: string; reason: string; status: string } }) => {
        if (!requests.some((r) => r.chargeId === create.chargeId)) requests.push(create);
      },
      deleteMany: async ({ where }: { where: { chargeId: string } }) => {
        const index = requests.findIndex((r) => r.chargeId === where.chargeId);
        if (index >= 0) requests.splice(index, 1);
      },
    },
  };
  const iap = {
    refundGoogleOrder: async (orderId: string) => {
      if (options.googleFails) throw new Error('google down');
      googleRefunds.push(orderId);
    },
  };
  const ledger = {
    markRefunded: async (_db: unknown, storeTransactionId: string, when: Date) => {
      for (const c of charges) if (c.storeTransactionId === storeTransactionId) c.refundedAt = when;
    },
  };
  const service = new RefundService(
    db as unknown as PrismaService,
    { get: () => undefined } as unknown as ConfigService,
    iap as unknown as IapVerificationService,
    ledger as unknown as ChargeLedgerService,
  );
  return { service, charges, requests, googleRefunds };
}

const charge = (id: string, extra: Partial<Charge> = {}): Charge => ({
  id,
  userId: 'fan',
  source: 'SANDBOX',
  storeTransactionId: null,
  chargedAt: at('2026-08-01T00:00:00Z'),
  periodEnd: at('2026-09-01T00:00:00Z'),
  refundedAt: null,
  rooms: ['a1'],
  ...extra,
});
const now = at('2026-09-03T00:00:00Z');

describe('환불 — 아티스트 미발송 판정', () => {
  it('기간 중 아티스트 메시지 0개 + 기간 끝난 뒤 7일 안이면 대상(팬 답장·지운 메시지는 안 셈)', async () => {
    const t = setup(
      [charge('c1')],
      [
        { actorId: 'a1', createdAt: at('2026-08-10T00:00:00Z'), senderType: 'FAN', deletedAt: null },
        { actorId: 'a1', createdAt: at('2026-08-11T00:00:00Z'), senderType: 'ARTIST', deletedAt: at('2026-08-11T00:01:00Z') },
        // 기간 밖(끝난 뒤) 메시지는 상관없음
        { actorId: 'a1', createdAt: at('2026-09-02T00:00:00Z'), senderType: 'ARTIST', deletedAt: null },
      ],
    );
    const list = await t.service.candidates('fan', now);
    expect(list).toEqual([expect.objectContaining({ chargeId: 'c1', reason: 'STAR_IDLE', deadline: '2026-09-08T00:00:00.000Z', requested: null })]);
  });

  it('메시지가 하나라도 있었거나, 7일이 지났거나, 아직 기간 중이거나, 남의 결제면 대상 아님', async () => {
    const t = setup(
      [charge('sent'), charge('late', { periodEnd: at('2026-08-20T00:00:00Z') }), charge('running', { periodEnd: at('2026-09-10T00:00:00Z') }), charge('other', { userId: 'x' })],
      [{ actorId: 'a1', createdAt: at('2026-08-31T23:00:00Z'), senderType: 'ARTIST', deletedAt: null }],
    );
    t.charges[0].rooms = ['a1'];
    for (const c of t.charges.slice(1)) c.rooms = ['a2'];
    expect((await t.service.candidates('fan', now)).map((c) => c.chargeId)).toEqual([]);
  });

  it('묶음은 들어 있는 방 전부가 조용했을 때만', async () => {
    const t = setup([charge('bundle', { rooms: ['a1', 'a2'] })], [{ actorId: 'a2', createdAt: at('2026-08-15T00:00:00Z'), senderType: 'ARTIST', deletedAt: null }]);
    expect(await t.service.candidates('fan', now)).toEqual([]);
  });
});

describe('환불 — 요청', () => {
  it('테스트 결제는 바로 환불 기록, 다시 누르면 이미 환불(대상에서 빠짐)', async () => {
    const t = setup([charge('c1')], []);
    expect(await t.service.request('fan', 'c1', now)).toEqual({ status: 'REFUNDED' });
    expect(t.charges[0].refundedAt).toEqual(now);
    await expect(t.service.request('fan', 'c1', now)).rejects.toThrow('환불 요청 대상이 아니에요');
  });

  it('구글은 그 결제(orderId)만 환불, 구글이 실패하면 요청 기록을 지우고 다시 시도 가능', async () => {
    const failing = setup([charge('g1', { source: 'GOOGLE', storeTransactionId: 'GPA.1..0' })], [], { googleFails: true });
    await expect(failing.service.request('fan', 'g1', now)).rejects.toThrow('google down');
    expect(failing.requests).toEqual([]);
    expect(failing.charges[0].refundedAt).toBeNull();

    const t = setup([charge('g1', { source: 'GOOGLE', storeTransactionId: 'GPA.1..0' })], []);
    expect(await t.service.request('fan', 'g1', now)).toEqual({ status: 'REFUNDED' });
    expect(t.googleRefunds).toEqual(['GPA.1..0']);
    expect(t.charges[0].refundedAt).toEqual(now);
  });

  it('애플은 환불 페이지 안내(결제는 애플이 환불할 때까지 그대로), 다시 눌러도 같은 안내', async () => {
    const t = setup([charge('a1', { source: 'APPLE', storeTransactionId: 'tx' })], []);
    expect(await t.service.request('fan', 'a1', now)).toEqual({ status: 'STORE_GUIDED', url: APPLE_REFUND_URL });
    expect(t.charges[0].refundedAt).toBeNull();
    expect((await t.service.candidates('fan', now))[0].requested).toBe('STORE_GUIDED');
    expect(await t.service.request('fan', 'a1', new Date(now.getTime() + DAY))).toMatchObject({ status: 'STORE_GUIDED' });
    expect(t.requests).toHaveLength(1);
  });
});

describe('환불 — 활동 종료·입대', () => {
  it('결제 후 14일 안에 활동이 끝나면 기간 중에도 바로 요청 가능(메시지를 받았어도)', async () => {
    const running = charge('r1', { chargedAt: at('2026-08-25T00:00:00Z'), periodEnd: at('2026-09-25T00:00:00Z') });
    const t = setup([running], [{ actorId: 'a1', createdAt: at('2026-08-26T00:00:00Z'), senderType: 'ARTIST', deletedAt: null }], {
      retired: { a1: at('2026-09-02T00:00:00Z') },
    });
    expect(await t.service.candidates('fan', now)).toEqual([
      expect.objectContaining({ chargeId: 'r1', reason: 'ACTOR_RETIRED', endedAt: '2026-09-02T00:00:00.000Z', deadline: '2026-10-02T00:00:00.000Z' }),
    ]);
    expect(await t.service.request('fan', 'r1', now)).toEqual({ status: 'REFUNDED' });
    expect(t.requests).toEqual([expect.objectContaining({ reason: 'ACTOR_RETIRED' })]);
  });

  it('결제 후 14일이 지나 끝났으면 대상 아님, 결제 전에 이미 끝난 방의 갱신 결제는 대상', async () => {
    const late = setup([charge('l1', { chargedAt: at('2026-08-10T00:00:00Z'), periodEnd: at('2026-09-10T00:00:00Z') })], [
      { actorId: 'a1', createdAt: at('2026-08-11T00:00:00Z'), senderType: 'ARTIST', deletedAt: null },
    ], { retired: { a1: at('2026-08-30T00:00:00Z') } });
    expect(await late.service.candidates('fan', now)).toEqual([]);

    const renewed = setup([charge('n1', { chargedAt: at('2026-08-20T00:00:00Z'), periodEnd: at('2026-09-20T00:00:00Z') })], [], {
      retired: { a1: at('2026-08-01T00:00:00Z') },
    });
    expect((await renewed.service.candidates('fan', now))[0]).toMatchObject({ reason: 'ACTOR_RETIRED' });
  });

  it('묶음은 들어 있는 방이 모두 끝났을 때만', async () => {
    const bundle = charge('b1', { chargedAt: at('2026-08-25T00:00:00Z'), periodEnd: at('2026-09-25T00:00:00Z'), rooms: ['a1', 'a2'] });
    const t = setup([bundle], [{ actorId: 'a2', createdAt: at('2026-08-26T00:00:00Z'), senderType: 'ARTIST', deletedAt: null }], {
      retired: { a1: at('2026-09-01T00:00:00Z') },
    });
    expect(await t.service.candidates('fan', now)).toEqual([]);
  });
});
