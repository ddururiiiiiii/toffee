import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useIAP, type Purchase } from 'expo-iap';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// 배우별 구독 상품 ID 규칙 — 실제 App Store Connect/Play Console에 이 규칙대로
// 상품을 등록해야 함(아직 등록된 상품 없음, 스토어 계정 준비되면 진행).
export function subscriptionSkuForActor(actorId: string): string {
  return `toffee_sub_${actorId}`;
}

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
export function usePurchaseSubscription(actorId: string) {
  const queryClient = useQueryClient();

  const { connected, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      await verifyAndActivate(actorId, purchase);
      await finishTransaction({ purchase });
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    },
  });

  const purchase = useCallback(() => {
    const sku = subscriptionSkuForActor(actorId);
    return requestPurchase({
      request: { apple: { sku }, google: { skus: [sku] } },
      type: 'subs',
    });
  }, [actorId, requestPurchase]);

  return { connected, purchase };
}
