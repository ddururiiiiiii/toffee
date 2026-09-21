import { Module } from '@nestjs/common';
import { ParentalConsentController } from './parental-consent.controller.js';
import { ParentalConsentService } from './parental-consent.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ParentalConsentController],
  providers: [ParentalConsentService],
})
export class ParentalConsentModule {}
