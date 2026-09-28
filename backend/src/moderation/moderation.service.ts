import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { appError } from '../common/i18n/app-error.js';

// 팬 답장 전송 전 대조용 — 금칙어 목록(ko/th/en)이 아직 몇십 개 수준이라 매번 전체
// 조회해도 무방함. 규모가 커지면 캐싱 고려.
@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertNoBannedWords(text: string): Promise<void> {
    const bannedWords = await this.prisma.bannedWord.findMany({ select: { term: true } });
    const lowerText = text.toLowerCase();
    const hit = bannedWords.some((word) => lowerText.includes(word.term.toLowerCase()));
    if (hit) {
      throw new BadRequestException(appError('CONTENT_INAPPROPRIATE'));
    }
  }
}
