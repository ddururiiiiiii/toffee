import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessageSenderType, ReportCategory, ReportStatus, Role } from '../generated/prisma/enums.js';
import { ensureCanViewActor } from '../common/authorization/actor-access.js';
import { ensureActiveSubscription } from '../common/authorization/ensure-active-subscription.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 신고는 운영자 대기열로만 감(신고한 쪽이 직접 제재하지 않음). 신고자가 그 메시지를 실제로 볼 수 있는
   * 사람인지 확인 — 팬은 구독 중인 배우가 보낸(구독 이후) 메시지만, 배우 본인·소속사는 자기 채널의 팬
   * 답장만. 같은 사람이 같은 메시지를 두 번 신고할 수는 없음(순위 부풀리기 방지).
   */
  async create(reportedById: string, messageId: string, category: ReportCategory, reason?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, actorId: true, senderType: true, fanUserId: true, createdAt: true },
    });
    if (!message) throw new NotFoundException('신고하려는 메시지를 찾을 수 없습니다.');
    const reporter = await this.prisma.user.findUniqueOrThrow({ where: { id: reportedById }, select: { role: true } });

    if (message.fanUserId === reportedById) throw new BadRequestException('내 메시지는 신고할 수 없어요.');
    if (reporter.role !== Role.ADMIN) {
      if (message.senderType === MessageSenderType.ARTIST) {
        if (reporter.role !== Role.USER) throw new ForbiddenException('이 메시지를 신고할 수 없어요.');
        const subscription = await ensureActiveSubscription(this.prisma, reportedById, message.actorId);
        if (message.createdAt < subscription.startedAt) throw new ForbiddenException('이 메시지를 신고할 수 없어요.');
      } else {
        if (reporter.role !== Role.ACTOR && reporter.role !== Role.AGENCY_STAFF) {
          throw new ForbiddenException('이 메시지를 신고할 수 없어요.');
        }
        await ensureCanViewActor(this.prisma, reportedById, message.actorId);
      }
    }

    try {
      return await this.prisma.report.create({
        data: { messageId, reportedById, category, reason: reason?.trim() || null },
        select: { id: true, category: true, status: true, createdAt: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('이미 신고한 메시지예요.');
      throw error;
    }
  }

  /**
   * 운영자 대기열 — 신고 횟수로 자동 제재하지 않는 대신(잠정 정책), 여러 사람이 신고한 메시지를 위로 올림.
   * 같은 메시지 신고가 여러 건이면 한 줄로 묶어서(가장 먼저 들어온 신고 기준) 보여줌.
   */
  async findPending() {
    const reports = await this.prisma.report.findMany({
      where: { status: ReportStatus.PENDING },
      include: {
        message: {
          select: {
            id: true,
            actorId: true,
            senderType: true,
            body: true,
            mediaType: true,
            createdAt: true,
            fanUser: { select: { id: true, nickname: true, displayName: true } },
            actor: { select: { chatDisplayName: true } },
          },
        },
        reportedBy: { select: { id: true, displayName: true, nickname: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const byMessage = new Map<string, { first: (typeof reports)[number]; reportIds: string[]; categories: Set<ReportCategory> }>();
    for (const report of reports) {
      const group = byMessage.get(report.messageId);
      if (group) {
        group.reportIds.push(report.id);
        group.categories.add(report.category);
      } else {
        byMessage.set(report.messageId, { first: report, reportIds: [report.id], categories: new Set([report.category]) });
      }
    }
    return [...byMessage.values()]
      .sort((a, b) => b.reportIds.length - a.reportIds.length || a.first.createdAt.getTime() - b.first.createdAt.getTime())
      .map(({ first, reportIds, categories }) => ({
        ...first,
        reportCount: reportIds.length,
        reportIds,
        categories: [...categories],
      }));
  }

  // 같은 메시지에 걸린 대기 중 신고를 한 번에 처리(목록이 메시지 단위로 묶여 있으므로).
  // 승인하면 메시지를 가림 — 팬 답장은 인용 부분이 "가려진 메시지"로(toQuote), 스타 메시지는 팬 화면에서 사라지고
  // 스타·소속사 화면엔 "운영 정책으로 가려진 메시지"로 남음(예전엔 스타 메시지 신고는 승인해도 아무 일 없었음).
  async resolve(id: string) {
    const report = await this.ensurePending(id);
    const now = new Date();
    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: report.messageId },
      select: { senderType: true, deletedAt: true },
    });
    await this.prisma.$transaction([
      this.prisma.report.updateMany({
        where: { messageId: report.messageId, status: ReportStatus.PENDING },
        data: { status: ReportStatus.RESOLVED, resolvedAt: now },
      }),
      ...(message.senderType === MessageSenderType.ARTIST && !message.deletedAt
        ? [this.prisma.message.update({ where: { id: report.messageId }, data: { deletedAt: now, deletedByAdmin: true } })]
        : []),
    ]);
    return this.prisma.report.findUniqueOrThrow({ where: { id } });
  }

  async dismiss(id: string) {
    const report = await this.ensurePending(id);
    await this.prisma.report.updateMany({
      where: { messageId: report.messageId, status: ReportStatus.PENDING },
      data: { status: ReportStatus.DISMISSED, resolvedAt: new Date() },
    });
    return this.prisma.report.findUniqueOrThrow({ where: { id } });
  }

  private async ensurePending(id: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('신고 내역을 찾을 수 없습니다.');
    if (report.status !== ReportStatus.PENDING) {
      throw new ConflictException('이미 처리된 신고입니다.');
    }
    return report;
  }
}
