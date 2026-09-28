import { Module } from '@nestjs/common';
import { ActorsController } from './actors.controller.js';
import { ActorsService } from './actors.service.js';
import { ModerationModule } from '../moderation/moderation.module.js';

@Module({
  imports: [ModerationModule],
  controllers: [ActorsController],
  providers: [ActorsService],
  exports: [ActorsService],
})
export class ActorsModule {}
