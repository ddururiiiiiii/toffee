import { describe, expect, it } from 'vitest';
import { SubscriptionsService } from './subscriptions.service.js';
import { CURRENT_TERMS_VERSION } from '../common/legal/terms.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { IapVerificationService } from './iap-verification.service.js';
import type { MediaService } from '../storage/media.service.js';

interface Purchase {
  id: string;
  userId: string;
  actorId: string | null;
  bundleId: string | null;
  priceCents: number | null;
  startedAt: Date;
  cancelledAt: Date | null;
  iapPlatform: string | null;
}
interface Sub {
  id: string;
  userId: string;
  actorId: string;
  startedAt: Date;
  cancelledAt: Date | null;
}

const DONE_USER = { termsVersion: CURRENT_TERMS_VERSION, birthDate: new Date('2000-01-01'), parentalConsentStatus: 'NOT_REQUIRED' };

/** 구매·방 이용권 규칙을 확인할 만큼만 흉내 낸 메모리 DB */
function fakeDb(user: Record<string, unknown> = DONE_USER) {
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;
  const actors = new Map([
    ['a1', { id: 'a1', monthlyPriceCents: 3000, retiredAt: null as Date | null }],
    ['a2', { id: 'a2', monthlyPriceCents: 3000, retiredAt: null as Date | null }],
  ]);
  const bundles = new Map([['b1', { id: 'b1', name: 'A+B', priceCents: 5000, active: true, actorIds: ['a1', 'a2'] }]]);
  const purchases: Purchase[] = [];
  const subs: Sub[] = [];
  const events: { actorId: string; type: string; priceCents?: number }[] = [];
  const withBundle = (p: Purchase) => {
    const b = p.bundleId ? bundles.get(p.bundleId)! : null;
    return { ...p, bundle: b ? { id: b.id, name: b.name, priceCents: b.priceCents, actors: b.actorIds.map((actorId) => ({ actorId })) } : null };
  };
  const db = {
    user: { findUniqueOrThrow: async () => user },
    actor: { findUnique: async ({ where }: { where: { id: string } }) => actors.get(where.id) ?? null },
    bundle: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const b = bundles.get(where.id);
        return b ? { ...b, actors: b.actorIds.map((actorId) => ({ actor: actors.get(actorId)! })) } : null;
      },
    },
    purchase: {
      findMany: async ({ where }: { where: { userId: string; actorId?: { in: string[] } } }) =>
        purchases
          .filter((p) => p.userId === where.userId && !p.cancelledAt && (!where.actorId || (p.actorId && where.actorId.in.includes(p.actorId))))
          .map(withBundle),
      findFirst: async ({ where }: { where: { id?: string; userId: string; bundleId?: string } }) => {
        const found = purchases.find(
          (p) => p.userId === where.userId && !p.cancelledAt && (!where.id || p.id === where.id) && (!where.bundleId || p.bundleId === where.bundleId),
        );
        return found ? withBundle(found) : null;
      },
      create: async ({ data }: { data: Partial<Purchase> }) => {
        const row: Purchase = { id: id('p'), actorId: null, bundleId: null, priceCents: null, cancelledAt: null, iapPlatform: null, startedAt: new Date(), userId: '', ...data };
        purchases.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Purchase> }) => Object.assign(purchases.find((p) => p.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<Purchase> }) => {
        purchases.filter((p) => where.id.in.includes(p.id)).forEach((p) => Object.assign(p, data));
      },
    },
    subscription: {
      findUnique: async ({ where }: { where: { userId_actorId: { userId: string; actorId: string } } }) =>
        subs.find((s) => s.userId === where.userId_actorId.userId && s.actorId === where.userId_actorId.actorId) ?? null,
      findUniqueOrThrow: async (args: { where: { userId_actorId: { userId: string; actorId: string } } }) => (await db.subscription.findUnique(args))!,
      findMany: async ({ where }: { where: { userId: string; actorId: { in: string[] } } }) =>
        subs.filter((s) => s.userId === where.userId && where.actorId.in.includes(s.actorId)),
      create: async ({ data }: { data: Omit<Sub, 'id'> }) => {
        const row = { id: id('s'), ...data };
        subs.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Sub> }) => Object.assign(subs.find((s) => s.id === where.id)!, data),
    },
    subscriptionEvent: {
      create: async ({ data }: { data: { actorId: string; type: string; priceCents?: number } }) => events.push(data),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  const service = new SubscriptionsService(db as unknown as PrismaService, {} as IapVerificationService, {} as MediaService);
  const open = (actorId: string) => subs.find((s) => s.actorId === actorId && !s.cancelledAt);
  return { service, purchases, subs, events, actors, bundles, open };
}

describe('구독 전 가입 절차 강제(서버)', () => {
  it('약관 동의·생년월일을 건너뛴 계정은 구독 불가', async () => {
    await expect(fakeDb({ ...DONE_USER, termsVersion: null }).service.subscribe('u', 'a1')).rejects.toThrow('가입 절차');
    await expect(fakeDb({ ...DONE_USER, birthDate: null }).service.subscribe('u', 'a1')).rejects.toThrow('가입 절차');
  });

  it('부모 동의 대기 중이면 구독 불가, 절차를 마쳤으면 구독', async () => {
    await expect(fakeDb({ ...DONE_USER, parentalConsentStatus: 'PENDING' }).service.subscribe('u', 'a1')).rejects.toThrow('법정대리인');
    const { service, open } = fakeDb();
    await expect(service.subscribe('u', 'a1')).resolves.toMatchObject({ subscription: { actorId: 'a1' } });
    expect(open('a1')).toBeTruthy();
  });

  it('성년 미만(성인만 가입)이면 구독 불가', async () => {
    await expect(fakeDb({ ...DONE_USER, parentalConsentStatus: 'UNDERAGE' }).service.subscribe('u', 'a1')).rejects.toThrow('성인');
  });
});

describe('활동 종료한 배우', () => {
  it('개인 구독도, 그 배우가 든 묶음도 신규 구독 불가', async () => {
    const db = fakeDb();
    db.actors.get('a1')!.retiredAt = new Date();
    await expect(db.service.subscribe('u', 'a1')).rejects.toThrow('활동을 종료한');
    await expect(db.service.subscribeBundle('u', 'b1')).rejects.toThrow('구독할 수 없는 묶음');
  });
});

describe('묶음 구독', () => {
  it('사면 포함된 방이 모두 열리고, 가격은 정가 비율로 나눠 기록', async () => {
    const db = fakeDb();
    await db.service.subscribeBundle('u', 'b1');
    expect(db.open('a1')).toBeTruthy();
    expect(db.open('a2')).toBeTruthy();
    expect(db.events).toEqual([
      { userId: 'u', actorId: 'a1', type: 'STARTED', priceCents: 2500 },
      { userId: 'u', actorId: 'a2', type: 'STARTED', priceCents: 2500 },
    ]);
  });

  it('개인 구독 중이던 배우는 묶음으로 옮겨지고 대화 시작 시점은 그대로(개인 구독은 해지)', async () => {
    const db = fakeDb();
    await db.service.subscribe('u', 'a1');
    const startedAt = db.open('a1')!.startedAt;
    const result = await db.service.subscribeBundle('u', 'b1');
    expect(result.replacedActorIds).toEqual(['a1']);
    expect(db.open('a1')!.startedAt).toBe(startedAt);
    expect(db.purchases.filter((p) => p.actorId === 'a1')[0].cancelledAt).not.toBeNull();
    // a1은 이미 열려 있었으니 시작 이력이 또 생기지 않음
    expect(db.events.filter((e) => e.actorId === 'a1' && e.type === 'STARTED')).toHaveLength(1);
  });

  it('같은 묶음을 두 번 살 수 없고, 묶음으로 열린 배우를 개인으로 또 살 수 없음', async () => {
    const db = fakeDb();
    await db.service.subscribeBundle('u', 'b1');
    await expect(db.service.subscribeBundle('u', 'b1')).rejects.toThrow('이미 구독 중인 묶음');
    await expect(db.service.subscribe('u', 'a1')).rejects.toThrow('이미 구독 중인 배우');
  });

  it('묶음으로만 열린 배우를 배우 단위로 해지하려 하면 묶음 해지로 안내', async () => {
    const db = fakeDb();
    await db.service.subscribeBundle('u', 'b1');
    await expect(db.service.unsubscribe('u', 'a1')).rejects.toThrow('묶음 구독(A+B)');
  });

  it('묶음을 해지하면 다른 구매가 없는 방만 닫힘', async () => {
    const db = fakeDb();
    await db.service.subscribeBundle('u', 'b1');
    // 실제 결제로 산 a2 개인 구독이 따로 있다고 가정(스토어 구독은 서버가 해지 못 해서 남아 있을 수 있음)
    db.purchases.push({ id: 'p-iap', userId: 'u', actorId: 'a2', bundleId: null, priceCents: 3000, startedAt: new Date(), cancelledAt: null, iapPlatform: 'IOS' });
    const bundlePurchase = db.purchases.find((p) => p.bundleId === 'b1')!;
    await db.service.cancelPurchase('u', bundlePurchase.id);
    expect(db.open('a1')).toBeUndefined();
    expect(db.open('a2')).toBeTruthy();
  });

  it('판매 중지된 묶음은 새로 못 삼', async () => {
    const db = fakeDb();
    db.bundles.get('b1')!.active = false;
    await expect(db.service.subscribeBundle('u', 'b1')).rejects.toThrow('구독할 수 없는 묶음');
  });
});
