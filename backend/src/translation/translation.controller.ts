import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import { TranslationService } from './translation.service.js';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../common/i18n/locales.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

class TranslateMessageDto {
  @IsIn(SUPPORTED_LOCALES)
  targetLanguage!: SupportedLocale;
}

@Controller('actors/:actorId/messages')
export class TranslationController {
  constructor(private readonly translation: TranslationService) {}

  // 번역 버튼 — 비용이 드는 호출이라 사람당 1분에 30번까지
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':messageId/translate')
  @HttpCode(HttpStatus.OK)
  translate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actorId') actorId: string,
    @Param('messageId') messageId: string,
    @Body() dto: TranslateMessageDto,
  ) {
    return this.translation.translateMessage(user.id, actorId, messageId, dto.targetLanguage);
  }
}
