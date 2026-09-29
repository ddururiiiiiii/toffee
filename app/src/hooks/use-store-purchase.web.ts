import type { StoreCheckout, StoreTarget } from './store-purchase-types';

export type { StoreCheckout, StoreTarget } from './store-purchase-types';

/** 웹엔 스토어 결제가 없음(앱에서만 구독 결제 — 스토어 정책). 화면은 샌드박스 구독(개발) 또는 "앱에서 구독" 안내 */
export function useStorePurchase(_target: StoreTarget): StoreCheckout {
  return { available: false, buy: async () => null, restore: async () => 0 };
}
