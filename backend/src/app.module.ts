import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { StoriesModule } from './stories/stories.module.js';
import { ActorsModule } from './actors/actors.module.js';
import { AgenciesModule } from './agencies/agencies.module.js';
import { StorageModule } from './storage/storage.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { AdminModule } from './admin/admin.module.js';
import { ParentalConsentModule } from './parental-consent/parental-consent.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    AuthModule,
    NotificationsModule,
    ReportsModule,
    MessagesModule,
    StoriesModule,
    ActorsModule,
    AgenciesModule,
    SubscriptionsModule,
    ModerationModule,
    AdminModule,
    ParentalConsentModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 순서 중요: 스로틀링 → JWT 인증(@Public() 이면 통과) → 역할 검사
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // 처리 안 된 예외(5xx)만 Sentry로 보냄 — HttpException(4xx)은 SDK가 알아서 제외
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
