import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library';
import { appError } from '../common/i18n/app-error.js';

// Apple이 공개하는 루트 인증서 — StoreKit2 JWS(서명된 트랜잭션·서버 알림) 검증에 필요.
// 자주 안 바뀌는 값이라 프로세스 실행 중엔 한 번만 받아서 메모리에 캐싱.
const APPLE_ROOT_CA_URL = 'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer';

/** 스토어가 확인해 준 구독 결제 한 건(애플·구글 공통 모양) */
export interface StoreTransaction {
  platform: 'IOS' | 'ANDROID';
  // 구독 인스턴스 식별자 = Purchase.iapTransactionId(애플 originalTransactionId, 구글 purchaseToken) — 갱신돼도 그대로
  originalTransactionId: string;
  // 결제 1건 식별자(애플 transactionId, 구글 orderId — 갱신마다 새로 생김) = PurchaseCharge.storeTransactionId
  storeTransactionId?: string;
  productId: string;
  // 이 결제 시각(애플 purchaseDate, 구글은 첫 결제만 startTime — 갱신 알림에선 알림 받은 시각)
  purchasedAt: Date;
  expiresAt: Date;
  // 결제할 때 앱이 넣어 준 우리 사용자 id(애플 appAccountToken, 구글 obfuscatedExternalAccountId) — 다른 계정의 영수증 방지·알림으로 사용자 찾기
  accountToken?: string;
  storeAmountMilli?: number;
  storeCurrency?: string;
  // 스토어 자동 갱신 상태(2026-10-02) — 구글 API의 autoRenewing, 애플 알림의 갱신 정보(autoRenewStatus). 모르면 비움(앱의 영수증 확인 등)
  willRenew?: boolean;
}

/** 애플 서버 알림(App Store Server Notifications V2)을 검증·해석한 결과 */
export interface AppleNotification {
  type: string;
  subtype?: string;
  transaction?: StoreTransaction;
  // 결제 실패 후 유예 기간이 켜져 있으면 그 끝(이때까지는 이용 유지)
  gracePeriodExpiresAt?: Date;
}

interface GooglePlaySubscriptionResponse {
  orderId?: string;
  startTimeMillis?: string;
  expiryTimeMillis: string;
  priceAmountMicros?: string;
  priceCurrencyCode?: string;
  obfuscatedExternalAccountId?: string;
  autoRenewing?: boolean;
}

/**
 * 스토어 영수증·알림 검증(2026-09-18 스캐폴딩, 2026-09-29 보강). 스토어 계정·상품 등록 전엔 설정값이 없어서 호출하면 실패함 —
 * App Store Connect/Play Console 설정을 넣으면 그대로 동작하게 짜 둠. 필요한 설정: `docs/product/ops-infra-backlog.md`.
 */
@Injectable()
export class IapVerificationService {
  private readonly logger = new Logger(IapVerificationService.name);
  private cachedAppleRootCertificate: Buffer | null = null;
  private appleVerifier: SignedDataVerifier | null = null;
  private readonly pubSubClient = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  // 운영(PRODUCTION) 환경 검증엔 앱의 Apple ID(숫자, App Store Connect "일반 정보")가 꼭 필요 — 예전 코드는 빠져 있어서 운영에서 검증이 실패했을 것
  // 스토어 설정이 아직 없으면 500 대신 503(스토어 결제 준비 전) — 검증을 그냥 통과시키진 않음
  private required(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) throw new ServiceUnavailableException(appError('SERVICE_UNAVAILABLE'));
    return value;
  }

  private async getAppleVerifier(): Promise<SignedDataVerifier> {
    if (this.appleVerifier) return this.appleVerifier;
    const bundleId = this.required('APPLE_BUNDLE_ID');
    const sandbox = this.configService.get<string>('APPLE_IAP_ENVIRONMENT') === 'SANDBOX';
    const appAppleId = Number(this.configService.get<string>('APPLE_APP_ID')) || undefined;
    this.appleVerifier = new SignedDataVerifier(
      [await this.getAppleRootCertificate()],
      true,
      sandbox ? Environment.SANDBOX : Environment.PRODUCTION,
      bundleId,
      sandbox ? undefined : appAppleId,
    );
    return this.appleVerifier;
  }

  // expo-iap가 iOS에서 주는 건 옛날 방식의 base64 영수증이 아니라 StoreKit2 서명 트랜잭션(JWS 문자열)이라, 애플 공식 라이브러리로
  // 로컬에서 서명을 검증하고 페이로드를 디코딩함(Apple 서버로 verifyReceipt를 호출하는 옛날 방식이 아님).
  async verifyApple(signedTransaction: string): Promise<StoreTransaction> {
    const verifier = await this.getAppleVerifier();
    const payload = await verifier.verifyAndDecodeTransaction(signedTransaction).catch(() => null);
    const transaction = payload ? appleTransaction(payload) : null;
    if (!transaction) throw new BadRequestException(appError('IAP_APPLE_VERIFY_FAILED'));
    return transaction;
  }

  /** 애플 서버 알림 — 서명 검증 후 알림 종류와 안에 든 결제·갱신 정보를 풀어 줌 */
  async decodeAppleNotification(signedPayload: string): Promise<AppleNotification> {
    const verifier = await this.getAppleVerifier();
    const notification = await verifier.verifyAndDecodeNotification(signedPayload).catch((error: unknown) => {
      this.logger.warn(`애플 알림 검증 실패: ${String(error)}`);
      return null;
    });
    if (!notification?.notificationType) throw new BadRequestException(appError('IAP_APPLE_VERIFY_FAILED'));
    const [transactionPayload, renewal] = await Promise.all([
      notification.data?.signedTransactionInfo ? verifier.verifyAndDecodeTransaction(notification.data.signedTransactionInfo) : null,
      notification.data?.signedRenewalInfo ? verifier.verifyAndDecodeRenewalInfo(notification.data.signedRenewalInfo) : null,
    ]);
    const transaction = (transactionPayload && appleTransaction(transactionPayload)) || undefined;
    // 갱신 정보의 autoRenewStatus: 1 켜짐 / 0 꺼짐(팬이 해지) — 없으면 모름
    const willRenew = renewal?.autoRenewStatus === undefined ? undefined : Number(renewal.autoRenewStatus) === 1;
    return {
      type: String(notification.notificationType),
      subtype: notification.subtype ? String(notification.subtype) : undefined,
      transaction: transaction ? { ...transaction, willRenew } : undefined,
      gracePeriodExpiresAt: renewal?.gracePeriodExpiresDate ? new Date(renewal.gracePeriodExpiresDate) : undefined,
    };
  }

  private async getAppleRootCertificate(): Promise<Buffer> {
    if (this.cachedAppleRootCertificate) return this.cachedAppleRootCertificate;
    const res = await fetch(APPLE_ROOT_CA_URL);
    this.cachedAppleRootCertificate = Buffer.from(await res.arrayBuffer());
    return this.cachedAppleRootCertificate;
  }

  async verifyGoogle(purchaseToken: string, productId: string, now = new Date()): Promise<StoreTransaction> {
    const packageName = this.required('GOOGLE_PLAY_PACKAGE_NAME');
    const serviceAccountJson = this.required('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');

    const auth = new GoogleAuth({
      credentials: JSON.parse(serviceAccountJson) as Record<string, string>,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;
    if (!accessToken) throw new BadRequestException(appError('IAP_GOOGLE_AUTH_FAILED'));

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new BadRequestException(appError('IAP_GOOGLE_VERIFY_FAILED'));
    return googleTransaction(purchaseToken, productId, (await res.json()) as GooglePlaySubscriptionResponse, now);
  }

  /**
   * 구글 결제 한 건(orderId) 환불(2026-09-29, 스타 미발송 환불) — revoke=false라 지금 이용 중인 기간·자동 갱신은 그대로, 그 결제만 돌려줌.
   * 서비스 계정에 Play Console "주문 관리" 권한이 있어야 함.
   */
  async refundGoogleOrder(orderId: string): Promise<void> {
    const packageName = this.required('GOOGLE_PLAY_PACKAGE_NAME');
    const auth = new GoogleAuth({
      credentials: JSON.parse(this.required('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')) as Record<string, string>,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const accessToken = (await (await auth.getClient()).getAccessToken()).token;
    if (!accessToken) throw new BadRequestException(appError('IAP_GOOGLE_AUTH_FAILED'));
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/orders/${encodeURIComponent(orderId)}:refund?revoke=false`;
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new BadRequestException(appError('REFUND_FAILED'));
  }

  /**
   * 구글 실시간 개발자 알림(RTDN)은 Pub/Sub "푸시"로 옴 — 요청의 Authorization: Bearer <OIDC 토큰>이 우리가 지정한 서비스 계정이
   * 서명한 것인지 확인(아무나 가짜 "갱신됨" 알림을 보내지 못하게). 설정이 없으면 이 경로를 닫아 둠(404).
   */
  async verifyPubSubPush(authorization: string | undefined): Promise<void> {
    const audience = this.configService.get<string>('GOOGLE_RTDN_AUDIENCE');
    const serviceAccount = this.configService.get<string>('GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL');
    if (!audience || !serviceAccount) throw new NotFoundException();
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    const ticket = await this.pubSubClient.verifyIdToken({ idToken: token, audience }).catch(() => null);
    const payload = ticket?.getPayload();
    if (!payload || payload.email !== serviceAccount || payload.email_verified !== true) throw new UnauthorizedException();
  }
}

export function appleTransaction(payload: {
  originalTransactionId?: string;
  transactionId?: string;
  productId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  appAccountToken?: string;
  price?: number;
  currency?: string;
}): StoreTransaction | null {
  if (!payload.originalTransactionId || !payload.expiresDate || !payload.productId) return null;
  return {
    platform: 'IOS',
    originalTransactionId: payload.originalTransactionId,
    storeTransactionId: payload.transactionId,
    productId: payload.productId,
    purchasedAt: new Date(payload.purchaseDate ?? Date.now()),
    expiresAt: new Date(payload.expiresDate),
    accountToken: payload.appAccountToken || undefined,
    storeAmountMilli: payload.price,
    storeCurrency: payload.currency,
  };
}

// 구글 orderId는 첫 결제 "GPA.1234-...", 갱신마다 뒤에 "..0", "..1"이 붙음 — 갱신이면 결제 시각을 따로 안 주므로 지금 시각으로
export function googleTransaction(purchaseToken: string, productId: string, body: GooglePlaySubscriptionResponse, now: Date): StoreTransaction {
  const renewal = !!body.orderId && /\.\.\d+$/.test(body.orderId);
  return {
    platform: 'ANDROID',
    originalTransactionId: purchaseToken,
    storeTransactionId: body.orderId,
    productId,
    purchasedAt: !renewal && body.startTimeMillis ? new Date(Number(body.startTimeMillis)) : now,
    expiresAt: new Date(Number(body.expiryTimeMillis)),
    accountToken: body.obfuscatedExternalAccountId || undefined,
    storeAmountMilli: body.priceAmountMicros ? Math.round(Number(body.priceAmountMicros) / 1000) : undefined,
    storeCurrency: body.priceCurrencyCode,
    willRenew: body.autoRenewing,
  };
}
