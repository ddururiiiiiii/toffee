import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IapVerificationService } from './iap-verification.service.js';
import { ParentalConsentStatus } from '../generated/prisma/enums.js';
import type { VerifyPurchaseDto } from './dto/verify-purchase.dto.js';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iapVerificationService: IapVerificationService,
  ) {}

  async listMine(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId, cancelledAt: null },
      include: {
        actor: {
          select: { id: true, chatDisplayName: true, chatProfileImageUrl: true, monthlyPriceCents: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
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

    return { subscription, ...priceInfo };
  }

  async unsubscribe(userId: string, actorId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId_actorId: { userId, actorId } },
    });
    if (!existing || existing.cancelledAt) {
      throw new NotFoundException('구독 중인 배우가 아니에요.');
    }
    return this.prisma.subscription.update({ where: { id: existing.id }, data: { cancelledAt: new Date() } });
  }

  // 만 14세 미만인데 법정대리인 동의를 아직 못 받은 계정은 구독(결제) 자체를 막음
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
