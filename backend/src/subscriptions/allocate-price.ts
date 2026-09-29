/**
 * 묶음 가격을 포함된 배우들에게 나눠 적음 — 각 배우 개인 구독 정가 비율대로(잠정 정산 규칙, STATUS 정책 표).
 * 통계(SubscriptionEvent.priceCents, 배우별 매출)와 나중 정산의 기준. 반올림 차이는 마지막 배우에게 몰아서 합이 정확히
 * 묶음 가격이 되게. 정가가 모두 0이면 똑같이 나눔.
 */
export function allocateBundlePrice(bundlePriceCents: number, actors: { id: string; monthlyPriceCents: number }[]): Map<string, number> {
  const result = new Map<string, number>();
  if (actors.length === 0) return result;
  const total = actors.reduce((sum, actor) => sum + actor.monthlyPriceCents, 0);
  let assigned = 0;
  actors.forEach((actor, index) => {
    const last = index === actors.length - 1;
    const share = last
      ? bundlePriceCents - assigned
      : Math.round(total > 0 ? (bundlePriceCents * actor.monthlyPriceCents) / total : bundlePriceCents / actors.length);
    assigned += share;
    result.set(actor.id, share);
  });
  return result;
}
