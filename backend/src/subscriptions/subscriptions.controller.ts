import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SandboxSubscribeGuard } from '../common/guards/sandbox-subscribe.guard.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { VerifyPurchaseDto } from './dto/verify-purchase.dto.js';
import { SetNotificationsDto } from './dto/set-notifications.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me/subscriptions')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.listMine(user.id);
  }

  // 결제 없는 테스트 구독 — ENABLE_SANDBOX_SUBSCRIBE=true인 서버에서만(운영에선 404)
  @UseGuards(SandboxSubscribeGuard)
  @Post('actors/:actorId/subscribe')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string) {
    return this.subscriptionsService.subscribe(user.id, actorId);
  }

  @Post('actors/:actorId/verify-purchase')
  verifyPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actorId') actorId: string,
    @Body() dto: VerifyPurchaseDto,
  ) {
    return this.subscriptionsService.verifyPurchase(user.id, actorId, dto);
  }

  @Delete('actors/:actorId/subscribe')
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string) {
    return this.subscriptionsService.unsubscribe(user.id, actorId);
  }

  // 배우별 알림 끄기(채팅방 🔔)
  @Patch('actors/:actorId/subscribe/notifications')
  setNotifications(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string, @Body() dto: SetNotificationsDto) {
    return this.subscriptionsService.setNotificationsMuted(user.id, actorId, dto.muted);
  }
}
