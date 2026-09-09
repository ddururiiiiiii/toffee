import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportStatus } from '../generated/prisma/enums.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(reportedById: string, messageId: string, reason: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('신고하려는 메시지를 찾을 수 없습니다.');
    return this.prisma.report.create({ data: { messageId, reportedById, reason } });
  }

  findPending() {
    return this.prisma.report.findMany({
      where: { status: ReportStatus.PENDING },
      include: { message: true, reportedBy: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async resolve(id: string) {
    await this.ensurePending(id);
    return this.prisma.report.update({
      where: { id },
      data: { status: ReportStatus.RESOLVED, resolvedAt: new Date() },
    });
  }

  async dismiss(id: string) {
    await this.ensurePending(id);
    return this.prisma.report.update({
      where: { id },
      data: { status: ReportStatus.DISMISSED, resolvedAt: new Date() },
    });
  }

  private async ensurePending(id: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('신고 내역을 찾을 수 없습니다.');
    if (report.status !== ReportStatus.PENDING) {
      throw new ConflictException('이미 처리된 신고입니다.');
    }
  }
}
