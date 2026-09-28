import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { appError } from '../i18n/app-error.js';

// 배우 본인만 할 수 있는 행동(메시지·스토리 발송) — ADMIN은 전체 접근, 그 외엔
// 해당 배우의 본인 계정(Actor.selfUserId)만.
export async function ensureIsActorSelf(prisma: PrismaService, userId: string, actorId: string): Promise<void> {
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (requester.role === Role.ADMIN) return;

  const actor = await prisma.actor.findFirst({
    where: { id: actorId, selfUserId: userId },
    select: { id: true },
  });
  if (!actor) throw new ForbiddenException(appError('ACTOR_SELF_ONLY'));
}

// 스태프/배우 본인이 "볼 수 있는 배우" 조건 — 같은 소속사(현재 소속 기준) 스태프면 그 소속사 배우
// 전원, 배우 본인 계정이면 자기 자신. 소속사 안에서 직원별 담당 배우를 나누지 않음(2026-09-28 확정).
// 이적 전 소속사는 과거 기록도 못 봄 — ActorAgencyHistory는 정산/기록용일 뿐 권한 판단엔 안 씀.
export function viewableActorsWhere(requester: { id: string; role: Role; agencyId: string | null }): Prisma.ActorWhereInput {
  const conditions: Prisma.ActorWhereInput[] = [{ selfUserId: requester.id }];
  if (requester.role === Role.AGENCY_STAFF && requester.agencyId) conditions.push({ agencyId: requester.agencyId });
  return { OR: conditions };
}

// 배우 관련 읽기 전용 조회(답장 모아보기, 통계, 모니터링) — ADMIN, 같은 소속사 스태프,
// 배우 본인(Actor.selfUserId) 모두 접근 가능.
export async function ensureCanViewActor(prisma: PrismaService, userId: string, actorId: string): Promise<void> {
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (requester.role === Role.ADMIN) return;

  const actor = await prisma.actor.findFirst({
    where: { AND: [{ id: actorId }, viewableActorsWhere(requester)] },
    select: { id: true },
  });
  if (!actor) throw new ForbiddenException(appError('ACTOR_STAFF_OR_SELF_ONLY'));
}
