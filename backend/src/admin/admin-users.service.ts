import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, UserStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

const LIST_SELECT = {
  id: true,
  displayName: true,
  nickname: true,
  email: true,
  role: true,
  status: true,
  suspendedUntil: true,
  bannedAt: true,
  createdAt: true,
  deletedAt: true,
  agency: { select: { id: true, name: true } },
  actorSelf: { select: { id: true, legalName: true } },
} as const;

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query?: string, role?: Role) {
    const where: Prisma.UserWhereInput = {};
    if (role) where.role = role;
    if (query) {
      where.OR = [
        { displayName: { contains: query, mode: 'insensitive' } },
        { nickname: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  suspend(userId: string, until: Date) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.SUSPENDED, suspendedUntil: until, bannedAt: null },
      select: LIST_SELECT,
    });
  }

  ban(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.BANNED, bannedAt: new Date(), suspendedUntil: null },
      select: LIST_SELECT,
    });
  }

  reactivate(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE, suspendedUntil: null, bannedAt: null },
      select: LIST_SELECT,
    });
  }

  /**
   * 역할 변경 — 스타·소속사 직원도 일반 가입(소셜 로그인)으로 들어온 뒤 운영자가 여기서 바꿈.
   * - 운영자 계정은 바꾸지 않고, 운영자로 올리는 것도 불가(DTO에서 막음)
   * - 구독 중인 팬 계정은 배우/직원으로 못 바꿈(결제 중인 팬 계정이 관리 권한을 갖는 걸 막음)
   * - 역할이 바뀌면 이전 역할에 딸린 연결(소속사 배정, 배우 본인 연결)은 끊음
   */
  async changeRole(userId: string, role: Role) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true, _count: { select: { subscriptions: { where: { cancelledAt: null } } } } },
    });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (user.deletedAt) throw new BadRequestException('탈퇴한 계정이에요.');
    if (user.role === Role.ADMIN) throw new BadRequestException('운영자 계정의 역할은 여기서 바꿀 수 없어요.');
    if (user.role === role) return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: LIST_SELECT });
    if (role !== Role.USER && user._count.subscriptions > 0) {
      throw new BadRequestException('구독 중인 팬 계정은 배우·소속사 계정으로 바꿀 수 없어요.');
    }
    return this.prisma.$transaction(async (tx) => {
      if (user.role === Role.ACTOR) await tx.actor.updateMany({ where: { selfUserId: userId }, data: { selfUserId: null } });
      return tx.user.update({
        where: { id: userId },
        data: { role, agencyId: role === Role.AGENCY_STAFF ? undefined : null },
        select: LIST_SELECT,
      });
    });
  }
}
