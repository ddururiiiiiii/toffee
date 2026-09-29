import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, UserStatus, type ReportCategory } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { appError } from '../common/i18n/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { escapeLike } from '../common/utils/escape-like.js';

interface SanctionReason {
  category: ReportCategory;
  note?: string;
}

const LIST_SELECT = {
  id: true,
  displayName: true,
  nickname: true,
  email: true,
  role: true,
  status: true,
  suspendedUntil: true,
  bannedAt: true,
  sanctionCategory: true,
  sanctionNote: true,
  createdAt: true,
  deletedAt: true,
  agency: { select: { id: true, name: true } },
  actorSelf: { select: { id: true, legalName: true } },
} as const;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(query?: string, role?: Role) {
    const where: Prisma.UserWhereInput = {};
    if (role) where.role = role;
    if (query) {
      where.OR = [
        { displayName: { contains: escapeLike(query), mode: 'insensitive' } },
        { nickname: { contains: escapeLike(query), mode: 'insensitive' } },
        { email: { contains: escapeLike(query), mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  // 정지·영구차단은 사유(분류 + 내부 메모)를 같이 남기고 작업 기록에도 — 당사자에겐 로그인 때 분류가 번역돼서 안내됨
  async suspend(adminId: string, userId: string, until: Date, reason: SanctionReason) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.SUSPENDED, suspendedUntil: until, bannedAt: null, sanctionCategory: reason.category, sanctionNote: reason.note?.trim() || null },
      select: LIST_SELECT,
    });
    await this.audit.record(adminId, 'USER_SUSPEND', 'USER', userId, { until: until.toISOString(), ...reason });
    return user;
  }

  async ban(adminId: string, userId: string, reason: SanctionReason) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.BANNED, bannedAt: new Date(), suspendedUntil: null, sanctionCategory: reason.category, sanctionNote: reason.note?.trim() || null },
      select: LIST_SELECT,
    });
    await this.audit.record(adminId, 'USER_BAN', 'USER', userId, { ...reason });
    return user;
  }

  async reactivate(adminId: string, userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE, suspendedUntil: null, bannedAt: null, sanctionCategory: null, sanctionNote: null },
      select: LIST_SELECT,
    });
    await this.audit.record(adminId, 'USER_REACTIVATE', 'USER', userId);
    return user;
  }

  /**
   * 역할 변경 — 스타·소속사 직원도 일반 가입(소셜 로그인)으로 들어온 뒤 운영자가 여기서 바꿈.
   * - 운영자 계정은 바꾸지 않고, 운영자로 올리는 것도 불가(DTO에서 막음)
   * - 구독 중인 팬 계정은 배우/직원으로 못 바꿈(결제 중인 팬 계정이 관리 권한을 갖는 걸 막음)
   * - 역할이 바뀌면 이전 역할에 딸린 연결(소속사 배정, 배우 본인 연결)은 끊음
   */
  async changeRole(adminId: string, userId: string, role: Role) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true, _count: { select: { subscriptions: { where: { cancelledAt: null } } } } },
    });
    if (!user) throw new NotFoundException(appError('USER_NOT_FOUND'));
    if (user.deletedAt) throw new BadRequestException(appError('ACCOUNT_DELETED'));
    if (user.role === Role.ADMIN) throw new BadRequestException(appError('ADMIN_ROLE_LOCKED'));
    if (user.role === role) return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: LIST_SELECT });
    if (role !== Role.USER && user._count.subscriptions > 0) {
      throw new BadRequestException(appError('SUBSCRIBED_FAN_ROLE_CHANGE'));
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (user.role === Role.ACTOR) await tx.actor.updateMany({ where: { selfUserId: userId }, data: { selfUserId: null } });
      return tx.user.update({
        where: { id: userId },
        data: { role, agencyId: role === Role.AGENCY_STAFF ? undefined : null },
        select: LIST_SELECT,
      });
    });
    await this.audit.record(adminId, 'USER_ROLE', 'USER', userId, { from: user.role, to: role });
    return updated;
  }
}
