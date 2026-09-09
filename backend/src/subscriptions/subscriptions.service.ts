import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async unsubscribe(userId: string, actorId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId_actorId: { userId, actorId } },
    });
    if (!existing || existing.cancelledAt) {
      throw new NotFoundException('구독 중인 배우가 아니에요.');
    }
    return this.prisma.subscription.update({ where: { id: existing.id }, data: { cancelledAt: new Date() } });
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
