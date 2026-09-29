import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SandboxSubscribeGuard } from '../common/guards/sandbox-subscribe.guard.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { RefundService } from './refund.service.js';
import { RestorePurchasesDto, VerifyPurchaseDto } from './dto/verify-purchase.dto.js';
import { SetNotificationsDto } from './dto/set-notifications.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Controller()
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly refunds: RefundService,
  ) {}

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

  // 묶음 구독(결제 없는 테스트) — 개인 구독과 같은 조건에서만 열림
  @UseGuards(SandboxSubscribeGuard)
  @Post('bundles/:bundleId/subscribe')
  subscribeBundle(@CurrentUser() user: AuthenticatedUser, @Param('bundleId') bundleId: string) {
    return this.subscriptionsService.subscribeBundle(user.id, bundleId);
  }

  // 내가 구독 중인 묶음(구독 관리 화면)
  @Get('me/bundles')
  listMyBundles(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.listMyBundles(user.id);
  }

  // 구매 하나 해지(묶음 해지에 씀 — 배우 개인 구독은 DELETE actors/:id/subscribe로도 됨)
  @Delete('me/purchases/:purchaseId')
  cancelPurchase(@CurrentUser() user: AuthenticatedUser, @Param('purchaseId') purchaseId: string) {
    return this.subscriptionsService.cancelPurchase(user.id, purchaseId);
  }

  @Post('actors/:actorId/verify-purchase')
  verifyPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actorId') actorId: string,
    @Body() dto: VerifyPurchaseDto,
  ) {
    return this.subscriptionsService.verifyPurchase(user.id, actorId, dto);
  }

  // 묶음 스토어 결제 확인
  @Post('bundles/:bundleId/verify-purchase')
  verifyBundlePurchase(@CurrentUser() user: AuthenticatedUser, @Param('bundleId') bundleId: string, @Body() dto: VerifyPurchaseDto) {
    return this.subscriptionsService.verifyBundlePurchase(user.id, bundleId, dto);
  }

  // 구매 복원(기기 변경·재설치) — 스토어 심사에서 요구하는 "구매 복원" 버튼
  @Post('me/purchases/restore')
  restorePurchases(@CurrentUser() user: AuthenticatedUser, @Body() dto: RestorePurchasesDto) {
    return this.subscriptionsService.restorePurchases(user.id, dto.items);
  }

  @Delete('actors/:actorId/subscribe')
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string) {
    return this.subscriptionsService.unsubscribe(user.id, actorId);
  }

  // 환불 요청(스타 미발송·활동 종료) — 지금 요청할 수 있는 내 결제(구독 관리 화면)
  @Get('me/refunds')
  listRefundable(@CurrentUser() user: AuthenticatedUser) {
    return this.refunds.candidates(user.id);
  }

  @Post('me/refunds/:chargeId')
  requestRefund(@CurrentUser() user: AuthenticatedUser, @Param('chargeId') chargeId: string) {
    return this.refunds.request(user.id, chargeId);
  }

  // 배우별 알림 끄기(채팅방 🔔)
  @Patch('actors/:actorId/subscribe/notifications')
  setNotifications(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string, @Body() dto: SetNotificationsDto) {
    return this.subscriptionsService.setNotificationsMuted(user.id, actorId, dto.muted);
  }
}
