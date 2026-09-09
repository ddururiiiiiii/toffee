import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../generated/prisma/enums.js';

// 콘솔(발송/답장/통계) 라우트 공통 권한 체크 — ADMIN은 전체 접근, 그 외엔 해당
// 배우의 담당 스태프(Actor.staff)로 등록된 사람만. messages/actors 서비스 양쪽에서 씀.
export async function ensureStaffOfActor(prisma: PrismaService, userId: string, actorId: string): Promise<void> {
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (requester.role === Role.ADMIN) return;

  const isStaff = await prisma.actor.findFirst({
    where: { id: actorId, staff: { some: { id: userId } } },
    select: { id: true },
  });
  if (!isStaff) throw new ForbiddenException('이 아티스트의 담당 스태프만 접근할 수 있어요.');
}
