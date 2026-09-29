import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IapVerificationService } from './iap-verification.service.js';
import { MessageSenderType, ParentalConsentStatus, SubscriptionEventType } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { VerifyPurchaseDto } from './dto/verify-purchase.dto.js';
import { MediaService } from '../storage/media.service.js';
import { appError } from '../common/i18n/app-error.js';
import { CURRENT_TERMS_VERSION } from '../common/legal/terms.js';
import { allocateBundlePrice } from './allocate-price.js';
import { RealtimeService } from '../realtime/realtime.service.js';

const LAST_MESSAGE_PREVIEW = 80;

type Db = Prisma.TransactionClient | PrismaService;

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
      await tx.purchase.create({ data: { userId, actorId, priceCents: actor.monthlyPriceCents } });
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
      await tx.purchase.create({ data: { userId, bundleId, priceCents: bundle.priceCents } });
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

  // 실제 IAP 결제 검증 후 구독 활성화 — 스토어 계정/상품 등록이 끝나면 이걸로 subscribe()를 대체
  async verifyPurchase(userId: string, actorId: string, dto: VerifyPurchaseDto) {
    await this.ensureCanSubscribe(userId);
    const actor = await this.ensureActorAvailable(actorId);

    const verified =
      dto.platform === 'IOS'
        ? await this.iapVerificationService.verifyApple(dto.signedTransaction!)
        : await this.iapVerificationService.verifyGoogle(dto.purchaseToken!, dto.productId!);

    const subscription = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { iapTransactionId: verified.transactionId } });
      // 같은 영수증을 다른 계정이 쓰려는 경우 — 예전엔 고유 제약 위반으로 500이 났음
      if (existing && existing.userId !== userId) throw new ConflictException(appError('IAP_RECEIPT_IN_USE'));
      const iap = { iapPlatform: dto.platform, iapTransactionId: verified.transactionId, iapExpiresAt: verified.expiresAt };
      if (existing) {
        // 갱신·복원 — 같은 구매의 만료일만 늘림
        await tx.purchase.update({ where: { id: existing.id }, data: { ...iap, cancelledAt: null } });
      } else {
        await tx.purchase.create({ data: { userId, actorId, priceCents: actor.monthlyPriceCents, ...iap } });
      }
      await this.syncAccess(tx, userId, [actorId], new Map([[actorId, actor.monthlyPriceCents]]));
      return tx.subscription.findUniqueOrThrow({ where: { userId_actorId: { userId, actorId } } });
    });
    this.accessChanged(userId);
    return { subscription, basePriceCents: actor.monthlyPriceCents, effectivePriceCents: actor.monthlyPriceCents, bundleDiscountApplied: false };
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
    const actor = await this.prisma.actor.findUnique({ where: { id: actorId }, select: { id: true, monthlyPriceCents: true, retiredAt: true } });
    if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    if (actor.retiredAt) throw new BadRequestException(appError('ACTOR_RETIRED'));
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
        actors: { select: { actor: { select: { id: true, monthlyPriceCents: true, retiredAt: true } } } },
      },
    });
    if (!bundle) throw new NotFoundException(appError('BUNDLE_NOT_FOUND'));
    if (!bundle.active || bundle.actors.length < 2 || bundle.actors.some((item) => item.actor.retiredAt)) {
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
