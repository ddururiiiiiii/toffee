import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export type AdminActionType =
  | 'USER_SUSPEND'
  | 'USER_BAN'
  | 'USER_REACTIVATE'
  | 'USER_ROLE'
  | 'REPORT_RESOLVE'
  | 'REPORT_DISMISS'
  | 'ACTOR_RETIRE'
  | 'ACTOR_RESTORE'
  // 가격·스토어 상품 변경(돈과 직결돼서 기록, 2026-09-29)
  | 'ACTOR_PRICE'
  | 'BUNDLE_CREATE'
  | 'BUNDLE_UPDATE'
  | 'COUPLE_CREATE';

/**
 * 운영자 작업 기록(AdminAction) — 제재·역할 변경·신고 처리·배우 활동 종료를 누가 언제 했는지. 유료 서비스 분쟁·문의 대응용.
 * 기록 실패가 본 작업을 막지 않게 호출하는 쪽은 await만 하고, 여기서 오류는 삼키지 않음(트랜잭션 밖 기록이라 드묾).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(adminId: string, action: AdminActionType, targetType: 'USER' | 'REPORT' | 'ACTOR' | 'BUNDLE', targetId: string, detail?: Prisma.InputJsonValue) {
    await this.prisma.adminAction.create({ data: { adminId, action, targetType, targetId, detail } });
  }

  /** 최근 기록(운영자 화면) — 누가·무엇을·대상 이름까지 한 번에 */
  async recent(limit = 100) {
    const actions = await this.prisma.adminAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { admin: { select: { displayName: true } } },
    });
    const userIds = actions.filter((a) => a.targetType === 'USER').map((a) => a.targetId);
    const actorIds = actions.filter((a) => a.targetType === 'ACTOR').map((a) => a.targetId);
    const bundleIds = actions.filter((a) => a.targetType === 'BUNDLE').map((a) => a.targetId);
    const [users, actors, bundles] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true, displayName: true, email: true } }),
      this.prisma.actor.findMany({ where: { id: { in: actorIds } }, select: { id: true, legalName: true } }),
      this.prisma.bundle.findMany({ where: { id: { in: bundleIds } }, select: { id: true, name: true } }),
    ]);
    const names = new Map<string, string>([
      ...users.map((u) => [u.id, u.nickname ?? u.displayName ?? u.email ?? u.id] as [string, string]),
      ...actors.map((a) => [a.id, a.legalName] as [string, string]),
      ...bundles.map((b) => [b.id, b.name] as [string, string]),
    ]);
    return actions.map(({ admin, ...action }) => ({ ...action, adminName: admin.displayName, targetName: names.get(action.targetId) ?? null }));
  }
}
