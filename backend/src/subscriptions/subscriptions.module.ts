import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller.js';
import { StoreNotificationsController } from './store-notifications.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { IapVerificationService } from './iap-verification.service.js';
import { IdleRefundService } from './idle-refund.service.js';
import { SettlementsModule } from '../settlements/settlements.module.js';

@Module({
  imports: [SettlementsModule],
  controllers: [SubscriptionsController, StoreNotificationsController],
  providers: [SubscriptionsService, IapVerificationService, IdleRefundService],
})
export class SubscriptionsModule {}
