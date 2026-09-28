import type { TFunction } from 'i18next';

/** 구독료 표시(바트) — 운영자가 배우별로 입력한 값, 실제 결제 금액은 스토어 상품 가격 */
export function formatPrice(t: TFunction, cents: number): string {
  return t('price.amount', { price: (cents / 100).toFixed(0) });
}
