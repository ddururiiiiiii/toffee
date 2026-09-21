import { Module } from '@nestjs/common';
import { PushService } from './push.service.js';
import { EmailService } from './email.service.js';

@Module({
  providers: [PushService, EmailService],
  exports: [PushService, EmailService],
})
export class NotificationsModule {}
