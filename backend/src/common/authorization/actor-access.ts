import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../generated/prisma/enums.js';

// 배우 본인만 할 수 있는 행동(메시지·스토리 발송) — ADMIN은 전체 접근, 그 외엔
// 해당 배우의 본인 계정(Actor.selfUserId)만.
export async function ensureIsActorSelf(prisma: PrismaService, userId: string, actorId: string): Promise<void> {
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (requester.role === Role.ADMIN) return;

  const actor = await prisma.actor.findFirst({
    where: { id: actorId, selfUserId: userId },
    select: { id: true },
  });
  if (!actor) throw new ForbiddenException('이 아티스트 본인 계정만 할 수 있어요.');
}

// 배우 관련 읽기 전용 조회(답장 모아보기, 통계) — ADMIN, 담당 스태프(Actor.staff),
// 배우 본인(Actor.selfUserId) 모두 접근 가능.
export async function ensureCanViewActor(prisma: PrismaService, userId: string, actorId: string): Promise<void> {
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (requester.role === Role.ADMIN) return;

  const actor = await prisma.actor.findFirst({
    where: { id: actorId, OR: [{ staff: { some: { id: userId } } }, { selfUserId: userId }] },
    select: { id: true },
  });
  if (!actor) throw new ForbiddenException('이 아티스트의 담당 스태프 또는 본인만 접근할 수 있어요.');
}
