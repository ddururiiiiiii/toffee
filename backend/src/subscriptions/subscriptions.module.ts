import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { IapVerificationService } from './iap-verification.service.js';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, IapVerificationService],
})
export class SubscriptionsModule {}
