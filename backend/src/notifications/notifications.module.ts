import { Module } from '@nestjs/common';
import { PushService } from './push.service.js';
import { EmailService } from './email.service.js';
import { IdleReminderService } from './idle-reminder.service.js';

@Module({
  providers: [PushService, EmailService, IdleReminderService],
  exports: [PushService, EmailService],
})
export class NotificationsModule {}
