import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IapVerificationService } from './iap-verification.service.js';
import { MessageSenderType, ParentalConsentStatus, SubscriptionEventType } from '../generated/prisma/enums.js';

const LAST_MESSAGE_PREVIEW = 80;
import type { VerifyPurchaseDto } from './dto/verify-purchase.dto.js';
import { MediaService } from '../storage/media.service.js';
import { appError } from '../common/i18n/app-error.js';
import { CURRENT_TERMS_VERSION } from '../common/legal/terms.js';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iapVerificationService: IapVerificationService,
    private readonly media: MediaService,
  ) {}

  /**
   * 내 구독 = 인박스 목록(B3 시안) — 채팅방마다 마지막 메시지 미리보기, 안 읽은 스타 메시지 수, 최근 대화 순 정렬.
   * 안 읽음 = 마지막으로 채팅방을 본 시각(lastReadAt, 없으면 구독 시작) 이후의 스타 메시지.
   */
  async listMine(userId: string) {
    const [subscriptions, me] = await Promise.all([
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

  // 결제(IAP)는 계약 성사 후에 붙임 — 지금은 결제 없이 구독 레코드만 만드는 샌드박스 플로우
  async subscribe(userId: string, actorId: string) {
    await this.ensureCanSubscribe(userId);
    const actor = await this.prisma.actor.findUnique({ where: { id: actorId } });
    if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    if (actor.retiredAt) throw new BadRequestException(appError('ACTOR_RETIRED'));

    const existing = await this.prisma.subscription.findUnique({
      where: { userId_actorId: { userId, actorId } },
    });
    if (existing && !existing.cancelledAt) {
      throw new BadRequestException(appError('ALREADY_SUBSCRIBED'));
    }

    const priceInfo = await this.calculatePrice(userId, actorId, actor.monthlyPriceCents);

    const subscription = existing
      ? await this.prisma.subscription.update({
          where: { id: existing.id },
          data: { startedAt: new Date(), cancelledAt: null, lastArtistMessageAt: null, lastFanReplyAt: null },
        })
      : await this.prisma.subscription.create({ data: { userId, actorId } });
    await this.recordEvent(userId, actorId, SubscriptionEventType.STARTED, priceInfo.effectivePriceCents);

    return { subscription, ...priceInfo };
  }

  // 실제 IAP 결제 검증 후 구독 활성화 — 스토어 계정/상품 등록이 끝나면 이걸로 subscribe()를 대체
  async verifyPurchase(userId: string, actorId: string, dto: VerifyPurchaseDto) {
    await this.ensureCanSubscribe(userId);
    const actor = await this.prisma.actor.findUnique({ where: { id: actorId } });
    if (!actor) throw new NotFoundException(appError('ACTOR_NOT_FOUND'));
    if (actor.retiredAt) throw new BadRequestException(appError('ACTOR_RETIRED'));

    const verified =
      dto.platform === 'IOS'
        ? await this.iapVerificationService.verifyApple(dto.signedTransaction!)
        : await this.iapVerificationService.verifyGoogle(dto.purchaseToken!, dto.productId!);

    const existing = await this.prisma.subscription.findUnique({
      where: { userId_actorId: { userId, actorId } },
    });
    const priceInfo = await this.calculatePrice(userId, actorId, actor.monthlyPriceCents);

    const data = {
      startedAt: new Date(),
      cancelledAt: null,
      lastArtistMessageAt: null,
      lastFanReplyAt: null,
      iapPlatform: dto.platform,
      iapTransactionId: verified.transactionId,
      iapExpiresAt: verified.expiresAt,
    };
    const subscription = existing
      ? await this.prisma.subscription.update({ where: { id: existing.id }, data })
      : await this.prisma.subscription.create({ data: { userId, actorId, ...data } });
    // 이미 구독 중인 상태에서 다시 검증(갱신·복원)한 건 새 시작이 아님
    if (!existing || existing.cancelledAt) {
      await this.recordEvent(userId, actorId, SubscriptionEventType.STARTED, priceInfo.effectivePriceCents);
    }

    return { subscription, ...priceInfo };
  }

  async unsubscribe(userId: string, actorId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId_actorId: { userId, actorId } },
    });
    if (!existing || existing.cancelledAt) {
      throw new NotFoundException(appError('NOT_SUBSCRIBED'));
    }
    const [subscription] = await this.prisma.$transaction([
      this.prisma.subscription.update({ where: { id: existing.id }, data: { cancelledAt: new Date() } }),
      this.prisma.subscriptionEvent.create({ data: { userId, actorId, type: SubscriptionEventType.CANCELLED } }),
    ]);
    return subscription;
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

  // 통계용 이력(SubscriptionEvent) — 구독률·해지율·재구독·매출 추이
  private recordEvent(userId: string, actorId: string, type: SubscriptionEventType, priceCents?: number) {
    return this.prisma.subscriptionEvent.create({ data: { userId, actorId, type, priceCents } });
  }

  // 구독(결제) 전 가입 절차를 서버에서도 강제 — 예전엔 앱 화면에서만 막아서, API를 직접 부르면 약관 동의·생년월일을
  // 건너뛰고(= 미성년자 부모 동의 우회) 구독할 수 있었음(2026-09-28 점검). 미성년자(국가별 기준)인데 법정대리인 동의를
  // 아직 못 받은 계정도 막음.
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
  }

  // 이 배우와 짝지어진(GlCp) 다른 배우를 이미 구독 중이면 번들 할인가를 안내만 함(결제는 아직 없음)
  private async calculatePrice(userId: string, actorId: string, basePriceCents: number) {
    const pairing = await this.prisma.glCp.findFirst({
      where: { OR: [{ actorOneId: actorId }, { actorTwoId: actorId }] },
    });
    if (!pairing) return { basePriceCents, effectivePriceCents: basePriceCents, bundleDiscountApplied: false };

    const pairedActorId = pairing.actorOneId === actorId ? pairing.actorTwoId : pairing.actorOneId;
    const pairedSubscription = await this.prisma.subscription.findUnique({
      where: { userId_actorId: { userId, actorId: pairedActorId } },
    });
    if (!pairedSubscription || pairedSubscription.cancelledAt) {
      return { basePriceCents, effectivePriceCents: basePriceCents, bundleDiscountApplied: false };
    }

    const effectivePriceCents = Math.round(basePriceCents * (1 - pairing.discountPercent / 100));
    return { basePriceCents, effectivePriceCents, bundleDiscountApplied: true };
  }
}
