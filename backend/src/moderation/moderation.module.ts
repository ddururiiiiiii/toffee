import { Module } from '@nestjs/common';
import { BannedWordsController } from './banned-words.controller.js';
import { BannedWordsService } from './banned-words.service.js';
import { ModerationService } from './moderation.service.js';

@Module({
  controllers: [BannedWordsController],
  providers: [BannedWordsService, ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
