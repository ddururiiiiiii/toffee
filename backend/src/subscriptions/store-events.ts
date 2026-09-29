import type { AppleNotification, StoreTransaction } from './iap-verification.service.js';
import type { StoreEvent } from './subscriptions.service.js';

/**
 * 애플 서버 알림 V2 → 우리 사건. https://developer.apple.com/documentation/appstoreservernotifications/notificationtype
 * 결제됨: SUBSCRIBED(첫 구독·재구독), DID_RENEW(갱신·결제 실패 후 회복), OFFER_REDEEMED. 유예: DID_FAIL_TO_RENEW + GRACE_PERIOD.
 * 만료: EXPIRED, GRACE_PERIOD_EXPIRED. 환불·취소: REFUND, REVOKE(가족 공유 해제). 자동 갱신 끔(DID_CHANGE_RENEWAL_STATUS)은 결제 기간
 * 끝까지 이용이라 할 일 없음(만료 알림이 따로 옴).
 */
export function appleStoreEvent(notification: AppleNotification): StoreEvent {
  const transaction = notification.transaction;
  if (!transaction) return { kind: 'IGNORED', reason: `${notification.type}: 결제 정보 없음` };
  switch (notification.type) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'OFFER_REDEEMED':
      return { kind: 'PAID', transaction };
    case 'DID_FAIL_TO_RENEW':
      return notification.subtype === 'GRACE_PERIOD' && notification.gracePeriodExpiresAt
        ? { kind: 'GRACE', originalTransactionId: transaction.originalTransactionId, until: notification.gracePeriodExpiresAt }
        : { kind: 'IGNORED', reason: 'DID_FAIL_TO_RENEW(유예 없음) — 만료 알림을 기다림' };
    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
      return { kind: 'EXPIRED', originalTransactionId: transaction.originalTransactionId, expiresAt: transaction.expiresAt };
    case 'REFUND':
    case 'REVOKE':
      return { kind: 'REFUNDED', originalTransactionId: transaction.originalTransactionId, storeTransactionId: transaction.storeTransactionId };
    default:
      return { kind: 'IGNORED', reason: notification.type };
  }
}

/** 구글 RTDN 메시지(Pub/Sub data를 base64 디코딩한 JSON) — https://developer.android.com/google/play/billing/rtdn-reference */
export interface GoogleRtdn {
  packageName?: string;
  subscriptionNotification?: { notificationType: number; purchaseToken: string; subscriptionId: string };
  voidedPurchaseNotification?: { purchaseToken: string; orderId: string; productType?: number };
  testNotification?: unknown;
}

// 결제됨(스토어 API로 최신 상태를 다시 받아서 기록): 1 RECOVERED, 2 RENEWED, 4 PURCHASED, 7 RESTARTED
export const GOOGLE_PAID_TYPES = new Set([1, 2, 4, 7]);
// 6 IN_GRACE_PERIOD: API의 만료일이 유예 끝까지 늘어나 있어서 PAID처럼 다시 받되 결제 기록은 안 남김(orderId가 그대로라 중복 안 됨)
export const GOOGLE_GRACE_TYPE = 6;

/**
 * 구글 알림 → 우리 사건. 결제·유예 알림은 구독 상태를 스토어 API로 다시 받아야 해서(알림엔 토큰만 있음) fetchTransaction을 부름.
 * 5 ON_HOLD(결제 보류 — 이용 중지)·13 EXPIRED는 만료, 12 REVOKED·환불(voided)은 환불. 3 CANCELED(자동 갱신 끔)는 기간 끝까지 이용.
 */
export async function googleStoreEvent(
  message: GoogleRtdn,
  fetchTransaction: (purchaseToken: string, productId: string) => Promise<StoreTransaction>,
): Promise<StoreEvent> {
  if (message.voidedPurchaseNotification) {
    const voided = message.voidedPurchaseNotification;
    return { kind: 'REFUNDED', originalTransactionId: voided.purchaseToken, storeTransactionId: voided.orderId };
  }
  const notification = message.subscriptionNotification;
  if (!notification) return { kind: 'IGNORED', reason: message.testNotification ? 'test' : '알 수 없는 알림' };
  const { notificationType, purchaseToken, subscriptionId } = notification;
  if (GOOGLE_PAID_TYPES.has(notificationType) || notificationType === GOOGLE_GRACE_TYPE) {
    const transaction = await fetchTransaction(purchaseToken, subscriptionId);
    return notificationType === GOOGLE_GRACE_TYPE
      ? { kind: 'GRACE', originalTransactionId: purchaseToken, until: transaction.expiresAt }
      : { kind: 'PAID', transaction };
  }
  // 만료·보류도 최신 상태를 다시 받아서 — 늦게 온 옛 알림이면 만료일이 아직 미래라 닫지 않음
  if (notificationType === 5 || notificationType === 13) {
    const transaction = await fetchTransaction(purchaseToken, subscriptionId);
    return { kind: 'EXPIRED', originalTransactionId: purchaseToken, expiresAt: transaction.expiresAt };
  }
  if (notificationType === 12) return { kind: 'REFUNDED', originalTransactionId: purchaseToken };
  return { kind: 'IGNORED', reason: `google type ${notificationType}` };
}
