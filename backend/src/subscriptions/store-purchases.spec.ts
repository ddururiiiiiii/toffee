import { describe, expect, it } from 'vitest';
import { endsAtOf, SubscriptionsService } from './subscriptions.service.js';
import { CURRENT_TERMS_VERSION } from '../common/legal/terms.js';
import { appleStoreEvent, googleStoreEvent } from './store-events.js';
import { googleTransaction, type IapVerificationService, type StoreTransaction } from './iap-verification.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MediaService } from '../storage/media.service.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import type { ChargeLedgerService } from '../settlements/charge-ledger.service.js';
import type { ConfigService } from '@nestjs/config';

type Row = Record<string, unknown> & { id: string };

// where 조건 흉내: 같은 값, { in }, { not: null }, { lt }
function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; not?: unknown; lt?: Date };
      if (c.in) return c.in.includes(value);
      if ('not' in c) return value !== c.not;
      if (c.lt) return value instanceof Date && value < c.lt;
    }
    return value === cond;
  });
}

const DAY = 24 * 60 * 60 * 1000;

/** 스토어 결제 흐름을 확인할 만큼만 흉내 낸 메모리 DB — 배우 a1(상품 toffee.a1), 묶음 b1(a1+a2, 상품 toffee.b1) */
function setup() {
  let seq = 0;
  const users: Row[] = [
    { id: 'u', termsVersion: CURRENT_TERMS_VERSION, birthDate: new Date('2000-01-01'), parentalConsentStatus: 'NOT_REQUIRED' },
    { id: 'other', termsVersion: CURRENT_TERMS_VERSION, birthDate: new Date('2000-01-01'), parentalConsentStatus: 'NOT_REQUIRED' },
  ];
  const actors: Row[] = [
    { id: 'a1', monthlyPriceCents: 3000, storeProductId: 'toffee.a1', retiredAt: null, coupleMembers: [] },
    { id: 'a2', monthlyPriceCents: 3000, storeProductId: null, retiredAt: null, coupleMembers: [] },
  ];
  const bundles: Row[] = [{ id: 'b1', name: 'A+B', priceCents: 5000, storeProductId: 'toffee.b1', active: true, actorIds: ['a1', 'a2'] }];
  const purchases: Row[] = [];
  const subs: Row[] = [];
  const charges: { purchaseId: string; storeTransactionId?: string; chargedAt: Date; periodEnd?: Date }[] = [];
  const refunded: string[] = [];
  const actorOut = (a: Row) => a && { ...a, actors: undefined };
  const bundleOut = (b: Row) =>
    b && { ...b, actors: (b.actorIds as string[]).map((id) => ({ actorId: id, actor: actors.find((a) => a.id === id)! })) };
  const withBundle = (p: Row) => {
    const b = bundles.find((x) => x.id === p.bundleId);
    return { ...p, bundle: b ? { id: b.id, name: b.name, priceCents: b.priceCents, actors: (b.actorIds as string[]).map((actorId) => ({ actorId })) } : null };
  };
  const db = {
    user: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id)!,
      findUnique: async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null,
    },
    actor: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => actorOut(actors.find((a) => matches(a, where))!) ?? null,
      findUniqueOrThrow: async ({ where }: { where: Record<string, unknown> }) => actors.find((a) => matches(a, where))!,
    },
    bundle: { findUnique: async ({ where }: { where: Record<string, unknown> }) => bundleOut(bundles.find((b) => matches(b, where))!) ?? null },
    purchase: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const found = purchases.find((p) => matches(p, where));
        return found ? withBundle(found) : null;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = purchases.find((p) => matches(p, where));
        return found ? withBundle(found) : null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => purchases.filter((p) => matches(p, where)).map(withBundle),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: `p${++seq}`, actorId: null, bundleId: null, cancelledAt: null, iapPlatform: null, iapExpiresAt: null, ...data };
        purchases.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(purchases.find((p) => p.id === where.id)!, data),
    },
    subscription: {
      findUniqueOrThrow: async ({ where }: { where: { userId_actorId: { userId: string; actorId: string } } }) =>
        subs.find((s) => s.userId === where.userId_actorId.userId && s.actorId === where.userId_actorId.actorId)!,
      findMany: async ({ where }: { where: Record<string, unknown> }) => subs.filter((s) => matches(s, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `s${++seq}`, ...data };
        subs.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(subs.find((s) => s.id === where.id)!, data),
    },
    subscriptionEvent: { create: async () => ({}) },
    purchaseCharge: {
      findUnique: async ({ where }: { where: { storeTransactionId: string } }) => charges.find((c) => c.storeTransactionId === where.storeTransactionId) ?? null,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  let nextTransaction: StoreTransaction | null = null;
  const iap = { verifyApple: async () => nextTransaction!, verifyGoogle: async () => nextTransaction! };
  const ledger = {
    record: async (_tx: unknown, purchaseId: string, input: { storeTransactionId?: string; chargedAt: Date }) => {
      if (input.storeTransactionId && charges.some((c) => c.storeTransactionId === input.storeTransactionId)) return;
      charges.push({ purchaseId, storeTransactionId: input.storeTransactionId, chargedAt: input.chargedAt });
    },
    markRefunded: async (_db: unknown, storeTransactionId: string) => refunded.push(storeTransactionId),
  };
  const service = new SubscriptionsService(
    db as unknown as PrismaService,
    iap as unknown as IapVerificationService,
    {} as MediaService,
    { publish: () => Promise.resolve() } as unknown as RealtimeService,
    ledger as unknown as ChargeLedgerService,
    { get: () => undefined } as unknown as ConfigService,
  );
  const receipt = (overrides: Partial<StoreTransaction> = {}) => {
    nextTransaction = {
      platform: 'IOS',
      originalTransactionId: 'orig-1',
      storeTransactionId: 'tx-1',
      productId: 'toffee.a1',
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * DAY),
      accountToken: 'u',
      ...overrides,
    };
    return nextTransaction;
  };
  const open = (actorId: string, userId = 'u') => subs.find((s) => s.actorId === actorId && s.userId === userId && !s.cancelledAt);
  const iosDto = { platform: 'IOS' as const, signedTransaction: 'jws' };
  return { service, purchases, charges, refunded, receipt, open, iosDto };
}

describe('스토어 결제 확인', () => {
  it('맞는 상품이면 구매·방·첫 결제 기록', async () => {
    const t = setup();
    t.receipt();
    await t.service.verifyPurchase('u', 'a1', t.iosDto);
    expect(t.open('a1')).toBeTruthy();
    expect(t.purchases[0]).toMatchObject({ actorId: 'a1', iapTransactionId: 'orig-1', iapPlatform: 'IOS' });
    expect(t.charges).toEqual([expect.objectContaining({ purchaseId: t.purchases[0].id, storeTransactionId: 'tx-1' })]);
  });

  it('다른 아티스트·묶음의 상품 영수증으로는 못 엶', async () => {
    const t = setup();
    t.receipt({ productId: 'toffee.b1' });
    await expect(t.service.verifyPurchase('u', 'a1', t.iosDto)).rejects.toThrow('이 방의 구독 상품');
    t.receipt({ productId: 'toffee.unknown' });
    await expect(t.service.verifyPurchase('u', 'a1', t.iosDto)).rejects.toThrow('등록되지 않은 상품');
    expect(t.purchases).toHaveLength(0);
  });

  it('만료된 영수증·다른 계정의 영수증은 거절', async () => {
    const t = setup();
    t.receipt({ expiresAt: new Date(Date.now() - 1000) });
    await expect(t.service.verifyPurchase('u', 'a1', t.iosDto)).rejects.toThrow('만료');
    t.receipt({ accountToken: 'other' });
    await expect(t.service.verifyPurchase('u', 'a1', t.iosDto)).rejects.toThrow('다른 계정');
    // 계정 표시가 없는 영수증이라도 이미 다른 계정에 연결돼 있으면 거절
    t.receipt({ accountToken: undefined });
    await t.service.verifyPurchase('other', 'a1', t.iosDto);
    await expect(t.service.verifyPurchase('u', 'a1', t.iosDto)).rejects.toThrow('다른 계정');
  });

  it('묶음 결제는 포함된 방을 모두 엶', async () => {
    const t = setup();
    t.receipt({ productId: 'toffee.b1' });
    const result = await t.service.verifyBundlePurchase('u', 'b1', t.iosDto);
    expect(result.actorIds).toEqual(['a1', 'a2']);
    expect(t.open('a1') && t.open('a2')).toBeTruthy();
  });

  it('구매 복원은 하나가 실패해도 나머지를 복원하고 결과를 하나씩 알려 줌', async () => {
    const t = setup();
    t.receipt();
    const { results } = await t.service.restorePurchases('u', [t.iosDto]);
    expect(results).toEqual([{ productId: 'toffee.a1', restored: true }]);
    t.receipt({ productId: 'nope' });
    const failed = await t.service.restorePurchases('u', [t.iosDto]);
    expect(failed.results[0]).toMatchObject({ restored: false, code: 'IAP_PRODUCT_UNKNOWN' });
  });

  it('스토어 구독은 앱에서 해지하지 않고 스토어로 안내', async () => {
    const t = setup();
    t.receipt();
    await t.service.verifyPurchase('u', 'a1', t.iosDto);
    await expect(t.service.unsubscribe('u', 'a1')).rejects.toThrow('구독 관리');
    expect(t.open('a1')).toBeTruthy();
  });
});

describe('스토어 알림 반영', () => {
  it('갱신: 만료일이 늘고 새 결제가 한 번만 기록됨(같은 알림이 두 번 와도)', async () => {
    const t = setup();
    t.receipt();
    await t.service.verifyPurchase('u', 'a1', t.iosDto);
    const renewed = t.receipt({ storeTransactionId: 'tx-2', purchasedAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 60 * DAY) });
    await t.service.applyStoreEvent({ kind: 'PAID', transaction: renewed });
    await t.service.applyStoreEvent({ kind: 'PAID', transaction: renewed });
    expect(t.charges.map((c) => c.storeTransactionId)).toEqual(['tx-1', 'tx-2']);
    expect(t.purchases[0].iapExpiresAt).toEqual(renewed.expiresAt);
  });

  it('앱이 확인 요청을 못 보냈어도 결제에 심은 사용자 id로 구매를 만듦', async () => {
    const t = setup();
    await t.service.applyStoreEvent({ kind: 'PAID', transaction: t.receipt() });
    expect(t.open('a1')).toBeTruthy();
    // 사용자 id가 없거나 모르는 사용자면 아무것도 안 함(앱의 확인 요청을 기다림)
    const t2 = setup();
    expect(await t2.service.applyStoreEvent({ kind: 'PAID', transaction: t2.receipt({ accountToken: undefined }) })).toEqual({ applied: false });
    expect(await t2.service.applyStoreEvent({ kind: 'PAID', transaction: t2.receipt({ accountToken: 'ghost' }) })).toEqual({ applied: false });
  });

  it('만료되면 방이 닫히고, 환불되면 결제 기록이 환불로 바뀌고 방도 닫힘', async () => {
    const t = setup();
    t.receipt();
    await t.service.verifyPurchase('u', 'a1', t.iosDto);
    await t.service.applyStoreEvent({ kind: 'EXPIRED', originalTransactionId: 'orig-1' });
    expect(t.open('a1')).toBeUndefined();

    const r = setup();
    r.receipt();
    await r.service.verifyPurchase('u', 'a1', r.iosDto);
    await r.service.applyStoreEvent({ kind: 'REFUNDED', originalTransactionId: 'orig-1', storeTransactionId: 'tx-1' });
    expect(r.refunded).toEqual(['tx-1']);
    expect(r.open('a1')).toBeUndefined();
  });

  it('이미 끝난 지난 기간 결제만 환불되면(미발송 환불) 지금 기간 이용은 그대로', async () => {
    const t = setup();
    t.receipt();
    await t.service.verifyPurchase('u', 'a1', t.iosDto);
    t.charges.push({ purchaseId: 'p1', storeTransactionId: 'tx-old', chargedAt: new Date(Date.now() - 40 * DAY), periodEnd: new Date(Date.now() - 10 * DAY) });
    await t.service.applyStoreEvent({ kind: 'REFUNDED', originalTransactionId: 'orig-1', storeTransactionId: 'tx-old' });
    expect(t.refunded).toEqual(['tx-old']);
    expect(t.open('a1')).toBeDefined();
  });

  it('순서가 뒤바뀌어 늦게 온 옛 만료 알림은 무시(그 사이 갱신된 구독을 닫지 않음)', async () => {
    const t = setup();
    t.receipt();
    await t.service.verifyPurchase('u', 'a1', t.iosDto);
    const oldExpiry = new Date(Date.now() - DAY);
    expect(await t.service.applyStoreEvent({ kind: 'EXPIRED', originalTransactionId: 'orig-1', expiresAt: oldExpiry })).toEqual({ applied: false });
    // 아직 만료 전인데 온 만료 알림도 무시
    expect(await t.service.applyStoreEvent({ kind: 'EXPIRED', originalTransactionId: 'orig-1', expiresAt: new Date(Date.now() + DAY) })).toEqual({
      applied: false,
    });
    expect(t.open('a1')).toBeTruthy();
  });

  it('자동 갱신을 끄면 방은 그대로, 기간 끝 날짜가 "○일까지 이용"으로 — 다시 켜면 사라짐', async () => {
    const t = setup();
    const receipt = t.receipt();
    await t.service.verifyPurchase('u', 'a1', t.iosDto);
    expect((await t.service.applyStoreEvent({ kind: 'RENEWAL', originalTransactionId: receipt.originalTransactionId, willRenew: false })).applied).toBe(true);
    expect(t.open('a1')).toBeTruthy();
    expect(endsAtOf(t.purchases as never)).toEqual(receipt.expiresAt);
    await t.service.applyStoreEvent({ kind: 'RENEWAL', originalTransactionId: receipt.originalTransactionId, willRenew: true });
    expect(endsAtOf(t.purchases as never)).toBeNull();
  });

  it('이용 종료 날짜: 방을 여는 구매가 전부 갱신 꺼짐일 때만, 그중 가장 늦은 날', () => {
    const a = new Date('2026-11-01T00:00:00Z');
    const b = new Date('2026-11-15T00:00:00Z');
    expect(endsAtOf([{ iapExpiresAt: a, willRenew: false }, { iapExpiresAt: b, willRenew: false }])).toEqual(b);
    expect(endsAtOf([{ iapExpiresAt: a, willRenew: false }, { iapExpiresAt: b, willRenew: true }])).toBeNull();
    // 테스트 구독(만료일 없음)은 계속 이용
    expect(endsAtOf([{ iapExpiresAt: null, willRenew: false }])).toBeNull();
    expect(endsAtOf([])).toBeNull();
  });

  it('결제 실패 유예 기간엔 만료일을 유예 끝까지 늘려 둠', async () => {
    const t = setup();
    t.receipt();
    await t.service.verifyPurchase('u', 'a1', t.iosDto);
    const until = new Date(Date.now() + 45 * DAY);
    await t.service.applyStoreEvent({ kind: 'GRACE', originalTransactionId: 'orig-1', until });
    expect(t.purchases[0].iapExpiresAt).toEqual(until);
  });

  it('만료 정리: 만료일이 유예(24시간)보다 더 지난 스토어 구매만 닫음', async () => {
    const t = setup();
    t.receipt();
    await t.service.verifyPurchase('u', 'a1', t.iosDto);
    const expiresAt = t.purchases[0].iapExpiresAt as Date;
    expect(await t.service.sweepExpired(new Date(expiresAt.getTime() + 60 * 60 * 1000))).toBe(0);
    expect(await t.service.sweepExpired(new Date(expiresAt.getTime() + 25 * 60 * 60 * 1000))).toBe(1);
    expect(t.open('a1')).toBeUndefined();
  });
});

describe('스토어 알림 해석', () => {
  const tx: StoreTransaction = {
    platform: 'IOS',
    originalTransactionId: 'o',
    storeTransactionId: 't',
    productId: 'p',
    purchasedAt: new Date(),
    expiresAt: new Date(),
  };

  it('애플', () => {
    expect(appleStoreEvent({ type: 'DID_RENEW', transaction: tx }).kind).toBe('PAID');
    expect(appleStoreEvent({ type: 'SUBSCRIBED', subtype: 'RESUBSCRIBE', transaction: tx }).kind).toBe('PAID');
    expect(appleStoreEvent({ type: 'EXPIRED', subtype: 'VOLUNTARY', transaction: tx })).toEqual({ kind: 'EXPIRED', originalTransactionId: 'o', expiresAt: tx.expiresAt });
    expect(appleStoreEvent({ type: 'REFUND', transaction: tx })).toEqual({ kind: 'REFUNDED', originalTransactionId: 'o', storeTransactionId: 't' });
    const until = new Date();
    expect(appleStoreEvent({ type: 'DID_FAIL_TO_RENEW', subtype: 'GRACE_PERIOD', transaction: tx, gracePeriodExpiresAt: until })).toEqual({
      kind: 'GRACE',
      originalTransactionId: 'o',
      until,
    });
    expect(appleStoreEvent({ type: 'DID_CHANGE_RENEWAL_STATUS', subtype: 'AUTO_RENEW_DISABLED', transaction: tx })).toEqual({
      kind: 'RENEWAL',
      originalTransactionId: 'o',
      willRenew: false,
    });
    expect(appleStoreEvent({ type: 'DID_CHANGE_RENEWAL_STATUS', subtype: 'AUTO_RENEW_ENABLED', transaction: tx })).toMatchObject({ kind: 'RENEWAL', willRenew: true });
    expect(appleStoreEvent({ type: 'TEST' }).kind).toBe('IGNORED');
  });

  it('구글', async () => {
    const fetch = async (token: string, productId: string) => ({ ...tx, platform: 'ANDROID' as const, originalTransactionId: token, productId });
    const sub = (notificationType: number) => ({ subscriptionNotification: { notificationType, purchaseToken: 'pt', subscriptionId: 'p' } });
    expect((await googleStoreEvent(sub(2), fetch)).kind).toBe('PAID');
    expect((await googleStoreEvent(sub(6), fetch)).kind).toBe('GRACE');
    expect(await googleStoreEvent(sub(13), fetch)).toMatchObject({ kind: 'EXPIRED', originalTransactionId: 'pt', expiresAt: tx.expiresAt });
    expect(await googleStoreEvent(sub(5), fetch)).toMatchObject({ kind: 'EXPIRED', originalTransactionId: 'pt' });
    expect(await googleStoreEvent(sub(3), fetch)).toEqual({ kind: 'RENEWAL', originalTransactionId: 'pt', willRenew: false });
    expect(await googleStoreEvent({ voidedPurchaseNotification: { purchaseToken: 'pt', orderId: 'GPA.1..2' } }, fetch)).toEqual({
      kind: 'REFUNDED',
      originalTransactionId: 'pt',
      storeTransactionId: 'GPA.1..2',
    });
  });

  it('구글 구독 응답: 갱신 결제는 orderId 끝의 ..N, 금액은 micros → 1/1000', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const first = googleTransaction('pt', 'p', { orderId: 'GPA.1', startTimeMillis: '1790000000000', expiryTimeMillis: '1792000000000', priceAmountMicros: '99000000' }, now);
    expect(first.purchasedAt.getTime()).toBe(1790000000000);
    expect(first.storeAmountMilli).toBe(99000);
    const renewal = googleTransaction('pt', 'p', { orderId: 'GPA.1..0', startTimeMillis: '1790000000000', expiryTimeMillis: '1794000000000' }, now);
    expect(renewal.purchasedAt).toBe(now);
  });
});
