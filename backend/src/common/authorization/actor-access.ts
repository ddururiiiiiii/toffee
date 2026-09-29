import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActorKind, Role } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { appError } from '../i18n/app-error.js';

/**
 * 방(Actor)을 대신해 행동하는 배우 본인(메시지·스토리 발송, 방 이름 변경) — ADMIN은 전체 접근.
 * 1인 방은 그 배우 본인 계정(Actor.selfUserId), 커플방(2026-09-29)은 두 멤버 배우 중 이 계정과 연결된 배우.
 * 돌려주는 값은 "실제로 행동한 배우" id — 커플방 메시지에 누가 보냈는지 남기는 데 씀(운영자가 커플방에 보내면 null).
 */
export async function ensureIsActorSelf(prisma: PrismaService, userId: string, actorId: string): Promise<string | null> {
  const [requester, actor] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } }),
    prisma.actor.findUnique({
      where: { id: actorId },
      select: { kind: true, selfUserId: true, coupleMembers: { select: { member: { select: { id: true, selfUserId: true } } } } },
    }),
  ]);
  if (actor?.kind === ActorKind.COUPLE) {
    const self = actor.coupleMembers.find(({ member }) => member.selfUserId === userId);
    if (self) return self.member.id;
    if (requester.role === Role.ADMIN) return null;
  } else if (actor && (actor.selfUserId === userId || requester.role === Role.ADMIN)) {
    return actorId;
  }
  if (requester.role === Role.ADMIN && !actor) return null;
  throw new ForbiddenException(appError('ACTOR_SELF_ONLY'));
}

// 스태프/배우 본인이 "볼 수 있는 방" 조건 — 같은 소속사(현재 소속 기준) 스태프면 그 소속사 배우 전원, 배우 본인 계정이면
// 자기 자신. 커플방은 멤버 배우 중 하나라도 위 조건에 맞으면(각 소속사는 자기 배우가 든 커플방만, 2026-09-29).
// 소속사 안에서 직원별 담당 배우를 나누지 않음(2026-09-28 확정). 이적 전 소속사는 과거 기록도 못 봄 —
// ActorAgencyHistory는 정산/기록용일 뿐 권한 판단엔 안 씀.
export function viewableActorsWhere(requester: { id: string; role: Role; agencyId: string | null }): Prisma.ActorWhereInput {
  const self: Prisma.ActorWhereInput[] = [{ selfUserId: requester.id }];
  if (requester.role === Role.AGENCY_STAFF && requester.agencyId) self.push({ agencyId: requester.agencyId });
  return { OR: [...self, { kind: ActorKind.COUPLE, coupleMembers: { some: { member: { OR: self } } } }] };
}

// 배우 관련 읽기 전용 조회(답장 모아보기, 통계, 모니터링) — ADMIN, 같은 소속사 스태프,
// 배우 본인(Actor.selfUserId), 커플방은 멤버 배우 쪽 스태프·본인 모두 접근 가능.
export async function ensureCanViewActor(prisma: PrismaService, userId: string, actorId: string): Promise<void> {
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (requester.role === Role.ADMIN) return;

  const actor = await prisma.actor.findFirst({
    where: { AND: [{ id: actorId }, viewableActorsWhere(requester)] },
    select: { id: true },
  });
  if (!actor) throw new ForbiddenException(appError('ACTOR_STAFF_OR_SELF_ONLY'));
}

/** 이 방(또는 커플방 멤버 배우)이 활동 종료했는지 — 신규 구독·묶음 판매를 막는 데 씀 */
export function roomRetired(room: { retiredAt: Date | null; coupleMembers?: { member: { retiredAt: Date | null } }[] }): boolean {
  return !!room.retiredAt || (room.coupleMembers ?? []).some(({ member }) => !!member.retiredAt);
}
