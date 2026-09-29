import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IapVerificationService } from './iap-verification.service.js';
import { ChargeSource, MessageSenderType, ParentalConsentStatus, SubscriptionEventType } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import type { VerifyPurchaseDto } from './dto/verify-purchase.dto.js';
import { MediaService } from '../storage/media.service.js';
import { appError } from '../common/i18n/app-error.js';
import { CURRENT_TERMS_VERSION } from '../common/legal/terms.js';
import { allocateBundlePrice } from './allocate-price.js';
import { roomRetired } from '../common/authorization/actor-access.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { ChargeLedgerService, sourceOf } from '../settlements/charge-ledger.service.js';
import type { StoreTransaction } from './iap-verification.service.js';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

const LAST_MESSAGE_PREVIEW = 80;

type Db = Prisma.TransactionClient | PrismaService;

/** 스토어 상품 ID로 찾은 우리 상품(배우·커플방 또는 묶음) */
interface StoreTargetInfo {
  productId: string;
  actorId: string | undefined;
  bundleId: string | undefined;
  priceCents: number;
  actorIds: string[];
  prices: Map<string, number>;
}

/** 스토어 알림을 우리 쪽 사건으로 옮긴 것(store-events.ts가 애플·구글 알림을 이걸로 바꿈) */
export type StoreEvent =
  | { kind: 'PAID'; transaction: StoreTransaction }
  | { kind: 'GRACE'; originalTransactionId: string; until: Date }
  // expiresAt: 알림이 말하는 만료 시각 — 우리가 아는 만료일이 더 뒤면(그 사이 갱신됨) 늦게 온 옛 알림이라 무시
  | { kind: 'EXPIRED'; originalTransactionId: string; expiresAt?: Date }
  | { kind: 'REFUNDED'; originalTransactionId: string; storeTransactionId?: string }
  | { kind: 'IGNORED'; reason: string };

/** 유효한 구매 하나 — 배우 개인(actorId) 또는 묶음(bundle, 포함 배우들) */
const PURCHASE_INCLUDE = {
  bundle: { select: { id: true, name: true, priceCents: true, actors: { select: { actorId: true } } } },
} as const;
type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

function actorIdsOf(purchase: PurchaseRow): string[] {
  return purchase.actorId ? [purchase.actorId] : (purchase.bundle?.actors.map((item) => item.actorId) ?? []);
}

/**
 * 구독 = "구매(Purchase)"와 "방 이용권(Subscription)" 두 층(2026-09-29 묶음 구독 도입).
 * - 구매: 팬이 산 것 — 배우 개인 구독 하나 또는 묶음 하나. 해지·만료는 구매 단위.
 * - 방 이용권: 사람×배우 채팅방. 유효한 구매가 하나라도 그 배우를 포함하면 열림(syncAccess가 다시 계산). 대화가 보이기
 *   시작하는 시점(startedAt)·읽음·알림 끄기는 방 이용권에 있어서, 개인 구독 → 묶음으로 바꿔도 대화가 끊기지 않음.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iapVerificationService: IapVerificationService,
    private readonly media: MediaService,
    private readonly realtime: RealtimeService,
    private readonly ledger: ChargeLedgerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 내 구독 = 인박스 목록(B3 시안) — 채팅방마다 마지막 메시지 미리보기, 안 읽은 스타 메시지 수, 최근 대화 순 정렬.
   * 안 읽음 = 마지막으로 채팅방을 본 시각(lastReadAt, 없으면 구독 시작) 이후의 스타 메시지.
   * coveredBy: 이 방을 열어 주는 구매들(개인 구독/묶음) — 구독 관리 화면에서 "묶음으로 이용 중" 표시·해지 안내용.
   */
  async listMine(userId: string) {
    const [subscriptions, me, purchases] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { userId, cancelledAt: null },
        include: {
          actor: {
            select: { id: true, chatDisplayName: true, chatProfileImageUrl: true, monthlyPriceCents: true },
          },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { nickname: true, displayName: true } }),
      this.activePurchases(this.prisma, userId),
    ]);
    const fanName = me.nickname ?? me.displayName;
    const rows = await Promise.all(
      subscriptions.map(async (subscription) => {
        const visible = { actorId: subscription.actorId, deletedAt: null, createdAt: { gte: subscription.startedAt } };
        const readFrom = subscription.lastReadAt && subscription.lastReadAt > subscription.startedAt ? subscription.lastReadAt : subscription.startedAt;
        const [last, unreadCount, chatProfileImageUrl] = await Promise.all([
          this.prisma.message.findFirst({
            where: { ...visible, OR: [{ senderType: MessageSenderType.ARTIST }, { fanUserId: userId }] },
            orderBy: { createdAt: 'desc' },
            select: { senderType: true, mediaType: true, body: true, createdAt: true },
          }),
          this.prisma.message.count({
            where: { ...visible, senderType: MessageSenderType.ARTIST, createdAt: { gt: readFrom } },
          }),
          this.media.resolveImageUrl(subscription.actor.chatProfileImageUrl),
        ]);
        return {
          ...subscription,
          actor: { ...subscription.actor, chatProfileImageUrl },
          unreadCount,
          coveredBy: purchases
            .filter((purchase) => actorIdsOf(purchase).includes(subscription.actorId))
            .map((purchase) => ({
              purchaseId: purchase.id,
              // 스토어 결제면 해지는 스토어에서(앱이 바로 스토어 구독 관리로 안내)
              iapPlatform: purchase.iapPlatform,
              bundle: purchase.bundle ? { id: purchase.bundle.id, name: purchase.bundle.name, priceCents: purchase.bundle.priceCents } : null,
            })),
          lastMessage: last
            ? {
                senderType: last.senderType,
                mediaType: last.mediaType,
                // 스타 메시지의 {{name}}은 받는 팬 이름으로(채팅방과 같게)
                body: last.body ? last.body.replaceAll('{{name}}', fanName).slice(0, LAST_MESSAGE_PREVIEW) : null,
                createdAt: last.createdAt,
              }
            : null,
        };
      }),
    );
    const activity = (row: (typeof rows)[number]) => (row.lastMessage?.createdAt ?? row.startedAt).getTime();
    return rows.sort((a, b) => activity(b) - activity(a));
  }

  /** 내 유효한 묶음 구매 — 구독 관리 화면의 묶음 카드 */
  async listMyBundles(userId: string) {
    const purchases = await this.prisma.purchase.findMany({
      where: { userId, cancelledAt: null, bundleId: { not: null } },
      orderBy: { startedAt: 'desc' },
      include: {
        bundle: {
          select: {
            id: true,
            name: true,
            priceCents: true,
            actors: { select: { actor: { select: { id: true, chatDisplayName: true, chatProfileImageUrl: true, monthlyPriceCents: true } } } },
          },
        },
      },
    });
    return Promise.all(
      purchases.map(async (purchase) => ({
        purchaseId: purchase.id,
        startedAt: purchase.startedAt,
        iapPlatform: purchase.iapPlatform,
        bundle: {
          id: purchase.bundle!.id,
          name: purchase.bundle!.name,
          priceCents: purchase.bundle!.priceCents,
          actors: await Promise.all(
            purchase.bundle!.actors.map(async ({ actor }) => ({ ...actor, chatProfileImageUrl: await this.media.resolveImageUrl(actor.chatProfileImageUrl) })),
          ),
        },
      })),
    );
  }

  // 결제(IAP)는 계약 성사 후에 붙임 — 지금은 결제 없이 구매 기록만 만드는 샌드박스 플로우(ENABLE_SANDBOX_SUBSCRIBE)
  async subscribe(userId: string, actorId: string) {
    await this.ensureCanSubscribe(userId);
    const actor = await this.ensureActorAvailable(actorId);
    const subscription = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { userId_actorId: { userId, actorId } } });
      // 개인 구독이든 묶음이든 이미 열려 있으면 또 살 필요 없음
      if (existing && !existing.cancelledAt) throw new BadRequestException(appError('ALREADY_SUBSCRIBED'));
      const purchase = await tx.purchase.create({ data: { userId, actorId, priceCents: actor.monthlyPriceCents } });
      // 정산용 결제 기록(샌드박스 — 정산에선 기본 제외)
      await this.ledger.record(tx, purchase.id, { chargedAt: purchase.startedAt, source: ChargeSource.SANDBOX });
      await this.syncAccess(tx, userId, [actorId], new Map([[actorId, actor.monthlyPriceCents]]));
      return tx.subscription.findUniqueOrThrow({ where: { userId_actorId: { userId, actorId } } });
    });
    this.accessChanged(userId);
    return { subscription, basePriceCents: actor.monthlyPriceCents, effectivePriceCents: actor.monthlyPriceCents, bundleDiscountApplied: false };
  }

  /**
   * 묶음 구독(샌드박스). 포함된 배우를 이미 개인 구독 중이면 그 개인 구독은 해지하고 묶음으로 옮김(대화는 그대로 이어짐) —
   * 샌드박스엔 청구가 없어서 바로 해지해도 됨. 실제 결제가 붙으면 스토어 구독은 앱이 끊을 수 없으므로 앱이 구매 전에
   * "개인 구독은 스토어에서 해지해 주세요"를 안내해야 함(replacedActorIds).
   */
  async subscribeBundle(userId: string, bundleId: string) {
    await this.ensureCanSubscribe(userId);
    const bundle = await this.ensureBundleAvailable(bundleId);
    const actorIds = bundle.actors.map((item) => item.actor.id);
    const shares = allocateBundlePrice(bundle.priceCents, bundle.actors.map((item) => item.actor));
    const replacedActorIds = await this.prisma.$transaction(async (tx) => {
      const same = await tx.purchase.findFirst({ where: { userId, bundleId, cancelledAt: null }, select: { id: true } });
      if (same) throw new BadRequestException(appError('ALREADY_SUBSCRIBED_BUNDLE'));
      const solos = await tx.purchase.findMany({
        where: { userId, cancelledAt: null, actorId: { in: actorIds } },
        select: { id: true, actorId: true, iapPlatform: true },
      });
      const purchase = await tx.purchase.create({ data: { userId, bundleId, priceCents: bundle.priceCents } });
      await this.ledger.record(tx, purchase.id, { chargedAt: purchase.startedAt, source: ChargeSource.SANDBOX });
      const sandboxSolos = solos.filter((solo) => !solo.iapPlatform);
      if (sandboxSolos.length) {
        await tx.purchase.updateMany({ where: { id: { in: sandboxSolos.map((solo) => solo.id) } }, data: { cancelledAt: new Date() } });
      }
      await this.syncAccess(tx, userId, actorIds, shares);
      return solos.map((solo) => solo.actorId!);
    });
    this.accessChanged(userId);
    return { bundleId, priceCents: bundle.priceCents, actorIds, replacedActorIds };
  }

  /**
   * 스토어 결제 확인(2026-09-29 보강) — 앱이 결제 직후 보낸 영수증을 스토어 서명·API로 확인하고 구매·방 이용권·결제 기록을 만듦.
   * 막는 것: 다른 계정의 영수증(appAccountToken/계정 id가 다르거나 이미 다른 계정에 연결됨), 만료된 영수증, 등록 안 된 상품,
   * 이 배우·묶음의 상품이 아닌 영수증(예전엔 싼 상품 영수증으로 비싼 배우 방을 열 수 있었음).
   */
  async verifyStorePurchase(userId: string, dto: VerifyPurchaseDto, expected: { actorId?: string; bundleId?: string } = {}) {
    await this.ensureCanSubscribe(userId);
    const verified =
      dto.platform === 'IOS'
        ? await this.iapVerificationService.verifyApple(dto.signedTransaction!)
        : await this.iapVerificationService.verifyGoogle(dto.purchaseToken!, dto.productId!);
    if (verified.accountToken && verified.accountToken !== userId) throw new ConflictException(appError('IAP_RECEIPT_IN_USE'));
    if (verified.expiresAt.getTime() <= Date.now()) throw new BadRequestException(appError('IAP_EXPIRED'));
    const target = await this.storeTarget(verified.productId);
    if (!target) throw new BadRequestException(appError('IAP_PRODUCT_UNKNOWN'));
    if ((expected.actorId && target.actorId !== expected.actorId) || (expected.bundleId && target.bundleId !== expected.bundleId)) {
      throw new BadRequestException(appError('IAP_PRODUCT_MISMATCH'));
    }
    const result = await this.upsertStorePurchase(userId, verified, target);
    this.accessChanged(userId);
    return result;
  }

  // 개인 구독 결제(배우 화면) — 응답 모양은 샌드박스 구독과 같게
  async verifyPurchase(userId: string, actorId: string, dto: VerifyPurchaseDto) {
    await this.verifyStorePurchase(userId, dto, { actorId });
    const subscription = await this.prisma.subscription.findUniqueOrThrow({ where: { userId_actorId: { userId, actorId } } });
    const actor = await this.prisma.actor.findUniqueOrThrow({ where: { id: actorId }, select: { monthlyPriceCents: true } });
    return { subscription, basePriceCents: actor.monthlyPriceCents, effectivePriceCents: actor.monthlyPriceCents, bundleDiscountApplied: false };
  }

  // 묶음 결제 — 이미 개인 구독 중인 배우는 스토어 구독이라 앱이 끊을 수 없어서 목록만 돌려줌(앱이 "스토어에서 해지" 안내)
  async verifyBundlePurchase(userId: string, bundleId: string, dto: VerifyPurchaseDto) {
    const { actorIds } = await this.verifyStorePurchase(userId, dto, { bundleId });
    const solos = await this.prisma.purchase.findMany({
      where: { userId, cancelledAt: null, actorId: { in: actorIds } },
      select: { actorId: true },
    });
    return { bundleId, actorIds, replacedActorIds: solos.map((solo) => solo.actorId!) };
  }

  /** 구매 복원(기기 변경·재설치) — 앱이 스토어에서 받은 영수증들을 한 번에. 하나가 실패해도 나머지는 계속, 결과를 하나씩 알려 줌 */
  async restorePurchases(userId: string, items: VerifyPurchaseDto[]) {
    const results: { productId?: string; restored: boolean; code?: string }[] = [];
    for (const item of items) {
      try {
        const { target } = await this.verifyStorePurchase(userId, item);
        results.push({ productId: target.productId, restored: true });
      } catch (error) {
        const code = (error as { response?: { code?: string } }).response?.code;
        results.push({ productId: item.productId, restored: false, code: code ?? 'IAP_RESTORE_FAILED' });
      }
    }
    return { results };
  }

  // 스토어 상품 ID → 우리 상품(배우·커플방 또는 묶음)
  private async storeTarget(productId: string) {
    const [actor, bundle] = await Promise.all([
      this.prisma.actor.findUnique({ where: { storeProductId: productId }, select: { id: true, monthlyPriceCents: true } }),
      this.prisma.bundle.findUnique({
        where: { storeProductId: productId },
        select: { id: true, priceCents: true, actors: { select: { actor: { select: { id: true, monthlyPriceCents: true } } } } },
      }),
    ]);
    if (actor) return { productId, actorId: actor.id, bundleId: undefined, priceCents: actor.monthlyPriceCents, actorIds: [actor.id], prices: new Map([[actor.id, actor.monthlyPriceCents]]) };
    if (bundle) {
      const actors = bundle.actors.map((item) => item.actor);
      return { productId, actorId: undefined, bundleId: bundle.id, priceCents: bundle.priceCents, actorIds: actors.map((a) => a.id), prices: allocateBundlePrice(bundle.priceCents, actors) };
    }
    return null;
  }

  /**
   * 스토어 구매를 우리 구매로 — 같은 구독 인스턴스(originalTransactionId)가 있으면 만료일만 늘리고(갱신·복원), 없으면 새로(새 상품이면
   * 판매 중인지 확인). 결제 기록은 스토어 결제 id로 한 번만. 다른 계정에 이미 연결된 영수증이면 409.
   */
  private async upsertStorePurchase(
    userId: string,
    verified: StoreTransaction,
    target: StoreTargetInfo,
  ): Promise<{ purchaseId: string; actorIds: string[]; target: StoreTargetInfo }> {
    const existing = await this.prisma.purchase.findUnique({ where: { iapTransactionId: verified.originalTransactionId } });
    if (existing && existing.userId !== userId) throw new ConflictException(appError('IAP_RECEIPT_IN_USE'));
    if (!existing) {
      if (target.actorId) await this.ensureActorAvailable(target.actorId);
      if (target.bundleId) await this.ensureBundleAvailable(target.bundleId);
    }
    const charge = {
      chargedAt: verified.purchasedAt,
      periodEnd: verified.expiresAt,
      source: sourceOf(verified.platform),
      storeTransactionId: verified.storeTransactionId,
      storeAmountMilli: verified.storeAmountMilli,
      storeCurrency: verified.storeCurrency,
    };
    const iap = { iapPlatform: verified.platform, iapTransactionId: verified.originalTransactionId, iapExpiresAt: verified.expiresAt };
    let purchaseId: string;
    try {
      purchaseId = await this.writeStorePurchase(userId, verified, target, existing, iap, charge);
    } catch (error) {
      // 같은 영수증 확인이 동시에 두 번 오면(앱 재시도·스토어 알림과 겹침) 한쪽이 고유 제약에 걸림 — 예전엔 500. 이미 생긴 구매로 다시 처리
      if (!existing && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.upsertStorePurchase(userId, verified, target);
      }
      throw error;
    }
    return { purchaseId, actorIds: target.actorIds, target };
  }

  private async writeStorePurchase(
    userId: string,
    verified: StoreTransaction,
    target: StoreTargetInfo,
    existing: { id: string; iapExpiresAt: Date | null } | null,
    iap: { iapPlatform: 'IOS' | 'ANDROID'; iapTransactionId: string; iapExpiresAt: Date },
    charge: Parameters<ChargeLedgerService['record']>[2],
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      let id: string;
      if (existing) {
        // 만료일은 늘리기만(늦게 온 옛 영수증이 줄이지 않게)
        const expiresAt = existing.iapExpiresAt && existing.iapExpiresAt > verified.expiresAt ? existing.iapExpiresAt : verified.expiresAt;
        await tx.purchase.update({ where: { id: existing.id }, data: { ...iap, iapExpiresAt: expiresAt, cancelledAt: null } });
        id = existing.id;
      } else {
        const created = await tx.purchase.create({
          data: { userId, actorId: target.actorId, bundleId: target.bundleId, priceCents: target.priceCents, startedAt: verified.purchasedAt, ...iap },
        });
        id = created.id;
      }
      // 같은 결제(storeTransactionId)는 한 번만 — 스토어 알림이 먼저 기록했어도 중복 없음
      if (verified.storeTransactionId || !existing) await this.ledger.record(tx, id, charge);
      await this.syncAccess(tx, userId, target.actorIds, target.prices);
      return id;
    });
  }

  /**
   * 스토어 서버 알림 반영(애플 서버 알림 V2·구글 RTDN, StoreNotificationsService가 해석해서 넘김).
   * - PAID: 결제됨(첫 결제·갱신·재구독) → 만료일 늘리고 결제 기록. 우리 구매가 아직 없으면 결제에 심어 둔 사용자 id로 만듦(앱이
   *   결제 직후 꺼져 확인 요청을 못 보낸 경우).
   * - GRACE: 결제 실패지만 스토어 유예 기간 — 그때까지 이용 유지.
   * - EXPIRED: 만료·결제 보류 → 해지 처리(방 닫힘).
   * - REFUNDED: 환불·취소 → 결제 기록을 환불로, 이용도 끊음.
   */
  async applyStoreEvent(event: StoreEvent) {
    if (event.kind === 'IGNORED') return { applied: false };
    if (event.kind === 'PAID') {
      const existing = await this.prisma.purchase.findUnique({ where: { iapTransactionId: event.transaction.originalTransactionId } });
      const userId = existing?.userId ?? event.transaction.accountToken;
      if (!userId) return { applied: false };
      if (!existing && !(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) return { applied: false };
      const target = await this.storeTarget(event.transaction.productId);
      if (!target) return { applied: false };
      await this.upsertStorePurchase(userId, event.transaction, target);
      this.accessChanged(userId);
      return { applied: true };
    }
    const purchase = await this.prisma.purchase.findUnique({ where: { iapTransactionId: event.originalTransactionId }, include: PURCHASE_INCLUDE });
    if (event.kind === 'REFUNDED' && event.storeTransactionId) await this.ledger.markRefunded(this.prisma, event.storeTransactionId);
    if (!purchase) return { applied: event.kind === 'REFUNDED' };
    if (event.kind === 'GRACE') {
      if (!purchase.iapExpiresAt || event.until > purchase.iapExpiresAt) {
        await this.prisma.purchase.update({ where: { id: purchase.id }, data: { iapExpiresAt: event.until } });
      }
      return { applied: true };
    }
    // 스토어 알림은 순서가 뒤바뀌어 올 수 있음 — 예전 만료 알림이 갱신 뒤에 도착하면 결제한 팬의 방을 닫게 됨(2026-09-29 점검)
    if (event.kind === 'EXPIRED' && event.expiresAt) {
      if (event.expiresAt.getTime() > Date.now()) return { applied: false };
      if (purchase.iapExpiresAt && purchase.iapExpiresAt > event.expiresAt) return { applied: false };
    }
    // EXPIRED · REFUNDED — 아직 열려 있으면 닫음
    if (!purchase.cancelledAt) await this.closePurchase(purchase);
    return { applied: true };
  }

  private async closePurchase(purchase: PurchaseRow) {
    await this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({ where: { id: purchase.id }, data: { cancelledAt: new Date() } });
      await this.syncAccess(tx, purchase.userId, actorIdsOf(purchase), new Map());
    });
    this.accessChanged(purchase.userId);
  }

  /**
   * 만료 정리(매시간) — 스토어 알림을 놓쳐도 만료일이 지난 스토어 구매는 닫음. 알림이 조금 늦게 와서 멀쩡한 갱신을 닫지 않게
   * IAP_EXPIRY_GRACE_HOURS(기본 24시간) 지난 것만. 잘못 닫혀도 앱의 "구매 복원"이나 다음 갱신 알림이 다시 엶.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepExpired(now = new Date()) {
    const hours = Number(this.config.get<string>('IAP_EXPIRY_GRACE_HOURS'));
    const graceMs = (Number.isFinite(hours) && hours >= 0 ? hours : 24) * 60 * 60 * 1000;
    const expired = await this.prisma.purchase.findMany({
      where: { iapPlatform: { not: null }, cancelledAt: null, iapExpiresAt: { lt: new Date(now.getTime() - graceMs) } },
      include: PURCHASE_INCLUDE,
    });
    for (const purchase of expired) await this.closePurchase(purchase);
    return expired.length;
  }

  /**
   * 배우 채팅방 해지 — 그 배우 개인 구독을 해지. 묶음으로만 열려 있으면 묶음 전체를 해지해야 해서 앱이 묶음 해지로
   * 안내하도록 409(COVERED_BY_BUNDLE, 묶음 이름·구매 ID 포함).
   */
  async unsubscribe(userId: string, actorId: string) {
    const purchases = (await this.activePurchases(this.prisma, userId)).filter((purchase) => actorIdsOf(purchase).includes(actorId));
    if (purchases.length === 0) throw new NotFoundException(appError('NOT_SUBSCRIBED'));
    const solo = purchases.find((purchase) => purchase.actorId === actorId);
    if (!solo) {
      const bundle = purchases.find((purchase) => purchase.bundle)!;
      throw new ConflictException(appError('COVERED_BY_BUNDLE', { name: bundle.bundle!.name }));
    }
    return this.cancelPurchase(userId, solo.id);
  }

  /** 구매 하나 해지(개인 구독·묶음 공통) — 포함된 방 중 다른 유효한 구매가 없는 방만 닫힘 */
  async cancelPurchase(userId: string, purchaseId: string) {
    const purchase = await this.prisma.purchase.findFirst({ where: { id: purchaseId, userId, cancelledAt: null }, include: PURCHASE_INCLUDE });
    if (!purchase) throw new NotFoundException(appError('PURCHASE_NOT_FOUND'));
    // 스토어 구독은 앱이 끊을 수 없음 — 여기서 닫으면 결제는 계속되는데 방만 닫힘. 스토어 구독 관리로 안내(앱이 코드로 분기)
    if (purchase.iapPlatform) throw new ConflictException(appError('IAP_MANAGE_IN_STORE'));
    await this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({ where: { id: purchase.id }, data: { cancelledAt: new Date() } });
      await this.syncAccess(tx, userId, actorIdsOf(purchase), new Map());
    });
    this.accessChanged(userId);
    return { purchaseId: purchase.id, actorIds: actorIdsOf(purchase) };
  }

  // 배우별 알림 끄기/켜기
  async setNotificationsMuted(userId: string, actorId: string, muted: boolean) {
    const existing = await this.prisma.subscription.findUnique({ where: { userId_actorId: { userId, actorId } } });
    if (!existing || existing.cancelledAt) throw new NotFoundException(appError('NOT_SUBSCRIBED'));
    return this.prisma.subscription.update({
      where: { id: existing.id },
      data: { notificationsMuted: muted },
      select: { actorId: true, notificationsMuted: true },
    });
  }

  /**
   * 방 이용권을 유효한 구매에 맞춰 다시 계산 — 구매가 생기거나 해지·만료될 때마다 영향 받는 배우들에 대해 부름.
   * 새로 열린 방은 대화를 지금부터 보여줌(재구독 시 이전 대화 비공개, 버블 방식)·시작 이력(STARTED, 가격은 prices),
   * 닫힌 방은 해지 이력(CANCELLED). 이미 열려 있던 방은 그대로(개인 → 묶음 전환에도 대화가 이어짐).
   */
  private async syncAccess(tx: Db, userId: string, actorIds: string[], prices: Map<string, number>) {
    if (actorIds.length === 0) return;
    const covered = new Set((await this.activePurchases(tx, userId)).flatMap(actorIdsOf));
    const existing = await tx.subscription.findMany({ where: { userId, actorId: { in: actorIds } } });
    const byActor = new Map(existing.map((sub) => [sub.actorId, sub]));
    const now = new Date();
    for (const actorId of new Set(actorIds)) {
      const sub = byActor.get(actorId);
      const open = !!sub && !sub.cancelledAt;
      if (covered.has(actorId) && !open) {
        const fresh = { startedAt: now, cancelledAt: null, lastArtistMessageAt: null, lastFanReplyAt: null };
        if (sub) await tx.subscription.update({ where: { id: sub.id }, data: fresh });
        else await tx.subscription.create({ data: { userId, actorId, ...fresh } });
        await tx.subscriptionEvent.create({ data: { userId, actorId, type: SubscriptionEventType.STARTED, priceCents: prices.get(actorId) } });
      } else if (!covered.has(actorId) && open) {
        await tx.subscription.update({ where: { id: sub.id }, data: { cancelledAt: now } });
        await tx.subscriptionEvent.create({ data: { userId, actorId, type: SubscriptionEventType.CANCELLED } });
      }
    }
  }

  // 이 사람의 구독이 바뀜 — 열려 있는 실시간 연결이 볼 수 있는 방 목록을 바로 다시 읽게(앱은 인박스를 새로고침)
  private accessChanged(userId: string) {
    void this.realtime.publish({ kind: 'access-changed', userId });
  }

  private activePurchases(db: Db, userId: string): Promise<PurchaseRow[]> {
    return db.purchase.findMany({ where: { userId, cancelledAt: null }, include: PURCHASE_INCLUDE, orderBy: { startedAt: 'asc' } });
  }

  private async ensureActorAvailable(actorId: string) {
    const actor = await this.prisma.actor.findUnique({
      where: { id: actorId },
      select: { id: true, monthlyPriceCents: true, retiredAt: true, coupleMembers: { select: { member: { select: { retiredAt: true } } } } },
    });
    if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    // 커플방은 멤버 배우 중 한 명이라도 활동 종료면 새 구독 중지(기존 팬은 유지)
    if (roomRetired(actor)) throw new BadRequestException(appError('ACTOR_RETIRED'));
    return actor;
  }

  // 판매 중지됐거나, 포함된 배우 중 활동을 종료한 배우가 있으면 새로 못 삼
  private async ensureBundleAvailable(bundleId: string) {
    const bundle = await this.prisma.bundle.findUnique({
      where: { id: bundleId },
      select: {
        id: true,
        priceCents: true,
        active: true,
        actors: {
          select: {
            actor: { select: { id: true, monthlyPriceCents: true, retiredAt: true, coupleMembers: { select: { member: { select: { retiredAt: true } } } } } },
          },
        },
      },
    });
    if (!bundle) throw new NotFoundException(appError('BUNDLE_NOT_FOUND'));
    if (!bundle.active || bundle.actors.length < 2 || bundle.actors.some((item) => roomRetired(item.actor))) {
      throw new BadRequestException(appError('BUNDLE_UNAVAILABLE'));
    }
    return bundle;
  }

  // 구독(결제) 전 가입 절차를 서버에서도 강제 — 예전엔 앱 화면에서만 막아서, API를 직접 부르면 약관 동의·생년월일을
  // 건너뛰고(= 미성년자 부모 동의 우회) 구독할 수 있었음(2026-09-28 점검). 미성년자(국가별 기준)인데 법정대리인 동의를
  // 아직 못 받은 계정, 성인만 가입일 때 성년 미만 계정도 막음.
  private async ensureCanSubscribe(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { termsVersion: true, birthDate: true, parentalConsentStatus: true },
    });
    if (user.termsVersion !== CURRENT_TERMS_VERSION) throw new ForbiddenException(appError('ONBOARDING_REQUIRED'));
    if (!user.birthDate) throw new ForbiddenException(appError('ONBOARDING_REQUIRED'));
    if (user.parentalConsentStatus === ParentalConsentStatus.PENDING) {
      throw new ForbiddenException(appError('CONSENT_REQUIRED_TO_SUBSCRIBE'));
    }
    if (user.parentalConsentStatus === ParentalConsentStatus.UNDERAGE) {
      throw new ForbiddenException(appError('UNDERAGE'));
    }
  }
}
