import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class StoryCleanupService {
  private readonly logger = new Logger(StoryCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 만료된 스토리 DB 레코드 정리(StoryView는 onDelete: Cascade로 같이 지워짐).
  // mediaUrl이 가리키는 실제 스토리지 파일 삭제는 아직 없음 — 스토리지 프로바이더
  // (Supabase Storage 등) 연동 자체가 아직 안 돼 있어서 후속 작업으로 남김.
  @Cron(CronExpression.EVERY_HOUR)
  async removeExpiredStories(): Promise<void> {
    const { count } = await this.prisma.story.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    if (count > 0) this.logger.log(`만료된 스토리 ${count}건 정리`);
  }
}
