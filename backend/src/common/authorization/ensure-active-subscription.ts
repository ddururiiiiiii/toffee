import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

// 팬이 이 배우의 콘텐츠(메시지/스토리)를 볼 수 있는지 — 활성 구독자만.
// messages/stories 서비스에서 공통으로 씀.
export async function ensureActiveSubscription(prisma: PrismaService, userId: string, actorId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId_actorId: { userId, actorId } },
  });
  if (!subscription || subscription.cancelledAt) {
    throw new ForbiddenException('이 아티스트를 구독해야 콘텐츠를 볼 수 있어요.');
  }
  return subscription;
}
