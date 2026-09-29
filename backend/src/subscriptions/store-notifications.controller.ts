import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator.js';
import { IapVerificationService } from './iap-verification.service.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { appleStoreEvent, googleStoreEvent, type GoogleRtdn } from './store-events.js';

/**
 * 스토어 서버 알림 받는 곳(2026-09-29) — 갱신·만료·환불을 앱이 켜져 있지 않아도 반영. 로그인 없이 스토어가 부르므로 대신 서명을 확인:
 * 애플은 알림 자체가 애플 인증서로 서명된 JWS, 구글은 Pub/Sub 푸시의 OIDC 토큰(우리가 지정한 서비스 계정).
 * App Store Connect "App Store 서버 알림 V2" URL = <API>/iap/apple/notifications, Pub/Sub 푸시 구독 엔드포인트 = <API>/iap/google/notifications.
 */
@Public()
@SkipThrottle()
@Controller('iap')
export class StoreNotificationsController {
  private readonly logger = new Logger(StoreNotificationsController.name);

  constructor(
    private readonly iap: IapVerificationService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Post('apple/notifications')
  @HttpCode(HttpStatus.OK)
  async apple(@Body('signedPayload') signedPayload: string | undefined) {
    if (!signedPayload) throw new BadRequestException();
    const notification = await this.iap.decodeAppleNotification(signedPayload);
    const event = appleStoreEvent(notification);
    const result = await this.subscriptions.applyStoreEvent(event);
    this.logger.log(`애플 알림 ${notification.type}${notification.subtype ? `/${notification.subtype}` : ''} → ${event.kind}${result.applied ? '' : '(반영 없음)'}`);
    return { ok: true };
  }

  @Post('google/notifications')
  @HttpCode(HttpStatus.OK)
  async google(@Headers('authorization') authorization: string | undefined, @Body() body: { message?: { data?: string } }) {
    await this.iap.verifyPubSubPush(authorization);
    let message: GoogleRtdn;
    try {
      message = JSON.parse(Buffer.from(body.message?.data ?? '', 'base64').toString('utf8')) as GoogleRtdn;
    } catch {
      // 해석 못 하는 메시지는 200으로 받아서 Pub/Sub이 계속 재전송하지 않게
      this.logger.warn('구글 알림 해석 실패');
      return { ok: true };
    }
    const event = await googleStoreEvent(message, (token, productId) => this.iap.verifyGoogle(token, productId));
    const result = await this.subscriptions.applyStoreEvent(event);
    this.logger.log(`구글 알림 → ${event.kind}${result.applied ? '' : '(반영 없음)'}`);
    return { ok: true };
  }
}
