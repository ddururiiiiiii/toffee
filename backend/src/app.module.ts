import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { BlocksModule } from './blocks/blocks.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { AdminModule } from './admin/admin.module.js';
import { ParentalConsentModule } from './parental-consent/parental-consent.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard.js';
import { LocalizedExceptionFilter } from './common/filters/localized-exception.filter.js';
import { AuditModule } from './audit/audit.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { BundlesModule } from './bundles/bundles.module.js';
import { LegalModule } from './legal/legal.module.js';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    RealtimeModule,
    AuditModule,
    StorageModule,
    AuthModule,
    NotificationsModule,
    ReportsModule,
    MessagesModule,
    StoriesModule,
    ActorsModule,
    AgenciesModule,
    BlocksModule,
    SubscriptionsModule,
    SettlementsModule,
    BundlesModule,
    LegalModule,
    ModerationModule,
    AdminModule,
    ParentalConsentModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 순서 중요: 스로틀링 → JWT 인증(@Public() 이면 통과) → 역할 검사
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // 오류 문구를 요청 언어로 번역 + 처리 안 된 예외(5xx)만 Sentry로 보냄(SentryGlobalFilter 확장)
    { provide: APP_FILTER, useClass: LocalizedExceptionFilter },
  ],
})
export class AppModule {}
