import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useIAP, type Purchase } from 'expo-iap';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// 스토어 구독 상품 ID는 운영자가 배우·묶음마다 입력(Actor.storeProductId / Bundle.storeProductId, 2026-09-29) — 예전
// 규칙 `toffee_sub_{배우ID}`는 배우 ID의 하이픈 때문에 애플·구글 상품 ID로 등록할 수 없었음. 없으면 아직 스토어 결제 불가.

interface VerifyPurchaseResult {
  subscription: { id: string; actorId: string };
  basePriceCents: number;
  effectivePriceCents: number;
  bundleDiscountApplied: boolean;
}

async function verifyAndActivate(actorId: string, purchase: Purchase): Promise<VerifyPurchaseResult> {
  const body =
    Platform.OS === 'ios'
      ? { platform: 'IOS' as const, signedTransaction: purchase.purchaseToken }
      : { platform: 'ANDROID' as const, productId: purchase.productId, purchaseToken: purchase.purchaseToken };
  return apiClient.post<VerifyPurchaseResult>(`/actors/${actorId}/verify-purchase`, body);
}

// 실제 스토어 상품이 등록되기 전까진 이 훅으로 결제를 테스트할 수 없음 —
// `POST /actors/:id/subscribe`(샌드박스, 결제 없음)를 계속 쓰다가 스토어 준비되면 이걸로 교체.
export function usePurchaseSubscription(actorId: string, storeProductId: string | null | undefined) {
  const queryClient = useQueryClient();

  const { connected, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      await verifyAndActivate(actorId, purchase);
      await finishTransaction({ purchase });
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    },
  });

  const purchase = useCallback(() => {
    const sku = storeProductId;
    if (!sku) return Promise.resolve(null);
    return requestPurchase({
      request: { apple: { sku }, google: { skus: [sku] } },
      type: 'subs',
    });
  }, [storeProductId, requestPurchase]);

  return { connected, purchase };
}
