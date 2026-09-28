import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

// 확정 규칙(2026-09-21, docs/product/feature-decisions.md "대화기록 보존 기간"): 팬 답장은 그 팬이 그 배우 구독을
// 해지한 지 1년이 지나면 삭제, 다시 구독 중이면 제외. 스타 메시지는 스타가 지우기 전까지 유지.
export const FAN_REPLY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class MessageRetentionService {
  private readonly logger = new Logger(MessageRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 매일 새벽(태국 시간 04:10) — 구독 해지 1년이 지난 팬의 그 채널 답장 삭제. 탈퇴한 팬도 탈퇴 때 구독이 해지 처리되므로
   * 같은 규칙으로 1년 뒤 삭제됨. 처리 대기 중인 신고가 걸린 답장은 운영자가 볼 수 있게 남김(처리 후 다음 날 삭제).
   * 이 답장을 스타가 인용했으면 인용 부분은 "삭제된 메시지"로 바뀜(replyToMessageId SetNull). 팬 답장은 텍스트뿐이라
   * 지울 파일은 없음.
   */
  @Cron('10 4 * * *', { timeZone: 'Asia/Bangkok' })
  async removeExpiredFanReplies(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - FAN_REPLY_RETENTION_MS);
    const count = await this.prisma.$executeRaw`
      DELETE FROM "Message" m
      USING "Subscription" s
      WHERE m."senderType" = 'FAN'
        AND s."userId" = m."fanUserId"
        AND s."actorId" = m."actorId"
        AND s."cancelledAt" IS NOT NULL
        AND s."cancelledAt" < ${cutoff}
        AND NOT EXISTS (SELECT 1 FROM "Report" r WHERE r."messageId" = m.id AND r.status = 'PENDING')`;
    if (count > 0) this.logger.log(`구독 해지 1년 지난 팬 답장 ${count}건 삭제`);
    return count;
  }
}
