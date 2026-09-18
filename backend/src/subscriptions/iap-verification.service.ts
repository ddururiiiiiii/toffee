import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library';

// Apple이 공개하는 루트 인증서 — StoreKit2 JWS(서명된 트랜잭션) 검증에 필요.
// 자주 안 바뀌는 값이라 프로세스 실행 중엔 한 번만 받아서 메모리에 캐싱.
const APPLE_ROOT_CA_URL = 'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer';

export interface VerifiedPurchase {
  transactionId: string;
  expiresAt: Date;
}

interface GooglePlaySubscriptionResponse {
  expiryTimeMillis: string;
}

// 실제 스토어 계정/상품 등록 전까지는 호출해도 실패함(자격증명·상품 ID가 없어서) —
// 계약 성사 후 App Store Connect/Play Console 설정이 끝나면 그대로 동작하도록 만든 스캐폴딩.
@Injectable()
export class IapVerificationService {
  private cachedAppleRootCertificate: Buffer | null = null;

  constructor(private readonly configService: ConfigService) {}

  // expo-iap가 iOS에서 주는 건 옛날 방식의 base64 영수증이 아니라 StoreKit2 서명 트랜잭션
  // (JWS 문자열)이라, 애플 공식 라이브러리로 로컬에서 서명을 검증하고 페이로드를 디코딩함
  // (Apple 서버로 verifyReceipt를 호출하는 옛날 방식이 아님).
  async verifyApple(signedTransaction: string): Promise<VerifiedPurchase> {
    const bundleId = this.configService.getOrThrow<string>('APPLE_BUNDLE_ID');
    const environment =
      this.configService.get<string>('APPLE_IAP_ENVIRONMENT') === 'SANDBOX'
        ? Environment.SANDBOX
        : Environment.PRODUCTION;

    const rootCertificate = await this.getAppleRootCertificate();
    const verifier = new SignedDataVerifier([rootCertificate], true, environment, bundleId);

    const payload = await verifier.verifyAndDecodeTransaction(signedTransaction).catch(() => null);
    if (!payload?.originalTransactionId || !payload.expiresDate) {
      throw new BadRequestException('애플 구매 검증에 실패했어요.');
    }

    return { transactionId: payload.originalTransactionId, expiresAt: new Date(payload.expiresDate) };
  }

  private async getAppleRootCertificate(): Promise<Buffer> {
    if (this.cachedAppleRootCertificate) return this.cachedAppleRootCertificate;
    const res = await fetch(APPLE_ROOT_CA_URL);
    this.cachedAppleRootCertificate = Buffer.from(await res.arrayBuffer());
    return this.cachedAppleRootCertificate;
  }

  async verifyGoogle(purchaseToken: string, productId: string): Promise<VerifiedPurchase> {
    const packageName = this.configService.getOrThrow<string>('GOOGLE_PLAY_PACKAGE_NAME');
    const serviceAccountJson = this.configService.getOrThrow<string>('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');

    const auth = new GoogleAuth({
      credentials: JSON.parse(serviceAccountJson) as Record<string, string>,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;
    if (!accessToken) throw new BadRequestException('구글 플레이 인증 토큰을 발급받지 못했어요.');

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new BadRequestException('구글 플레이 구매 검증에 실패했어요.');
    const body = (await res.json()) as GooglePlaySubscriptionResponse;

    // Google의 purchaseToken은 구매 인스턴스마다 고유해서 그대로 우리 쪽 트랜잭션 식별자로 씀
    return { transactionId: purchaseToken, expiresAt: new Date(Number(body.expiryTimeMillis)) };
  }
}
