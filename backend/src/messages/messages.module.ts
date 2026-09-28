import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { MessageRetentionService } from './message-retention.service.js';

@Module({
  imports: [NotificationsModule, ModerationModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessageRetentionService],
})
export class MessagesModule {}
