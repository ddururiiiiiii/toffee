import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller.js';
import { StoriesService } from './stories.service.js';
import { StoryCleanupService } from './story-cleanup.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [StoriesController],
  providers: [StoriesService, StoryCleanupService],
})
export class StoriesModule {}
