import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IapVerificationService } from './iap-verification.service.js';
import { ParentalConsentStatus, SubscriptionEventType } from '../generated/prisma/enums.js';
import type { VerifyPurchaseDto } from './dto/verify-purchase.dto.js';
import { MediaService } from '../storage/media.service.js';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iapVerificationService: IapVerificationService,
    private readonly media: MediaService,
  ) {}

  async listMine(userId: string) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { userId, cancelledAt: null },
      include: {
        actor: {
          select: { id: true, chatDisplayName: true, chatProfileImageUrl: true, monthlyPriceCents: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
    return Promise.all(
      subscriptions.map(async (subscription) => ({
        ...subscription,
        actor: { ...subscription.actor, chatProfileImageUrl: await this.media.resolveImageUrl(subscription.actor.chatProfileImageUrl) },
      })),
    );
  }

  // 결제(IAP)는 계약 성사 후에 붙임 — 지금은 결제 없이 구독 레코드만 만드는 샌드박스 플로우
  async subscribe(userId: string, actorId: string) {
    await this.ensureCanSubscribe(userId);
    const actor = await this.prisma.actor.findUnique({ where: { id: actorId } });
    if (!actor) throw new NotFoundException('배우를 찾을 수 없습니다.');

    const existing = await this.prisma.subscription.findUnique({
      where: { userId_actorId: { userId, actorId } },
    });
    if (existing && !existing.cancelledAt) {
      throw new BadRequestException('이미 구독 중인 배우예요.');
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
    if (!actor) throw new NotFoundException('배우를 찾을 수 없습니다.');

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
      throw new NotFoundException('구독 중인 배우가 아니에요.');
    }
    const [subscription] = await this.prisma.$transaction([
      this.prisma.subscription.update({ where: { id: existing.id }, data: { cancelledAt: new Date() } }),
      this.prisma.subscriptionEvent.create({ data: { userId, actorId, type: SubscriptionEventType.CANCELLED } }),
    ]);
    return subscription;
  }

  // 통계용 이력(SubscriptionEvent) — 구독률·해지율·재구독·매출 추이
  private recordEvent(userId: string, actorId: string, type: SubscriptionEventType, priceCents?: number) {
    return this.prisma.subscriptionEvent.create({ data: { userId, actorId, type, priceCents } });
  }

  // 미성년자(국가별 기준)인데 법정대리인 동의를 아직 못 받은 계정은 구독(결제) 자체를 막음
  private async ensureCanSubscribe(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.parentalConsentStatus === ParentalConsentStatus.PENDING) {
      throw new ForbiddenException('법정대리인 동의가 완료된 후 구독할 수 있어요.');
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
