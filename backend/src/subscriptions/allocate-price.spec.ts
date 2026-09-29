import { describe, expect, it } from 'vitest';
import { allocateBundlePrice } from './allocate-price.js';

describe('묶음 가격 나누기', () => {
  it('정가 비율대로, 합은 묶음 가격과 정확히 같게', () => {
    const shares = allocateBundlePrice(8000, [
      { id: 'a', monthlyPriceCents: 3000 },
      { id: 'b', monthlyPriceCents: 3000 },
      { id: 'c', monthlyPriceCents: 6000 },
    ]);
    expect([...shares.values()]).toEqual([2000, 2000, 4000]);
  });

  it('나누어떨어지지 않으면 차이는 마지막에', () => {
    const shares = allocateBundlePrice(1000, [
      { id: 'a', monthlyPriceCents: 1 },
      { id: 'b', monthlyPriceCents: 1 },
      { id: 'c', monthlyPriceCents: 1 },
    ]);
    expect([...shares.values()]).toEqual([333, 333, 334]);
  });

  it('정가가 모두 0이면 똑같이', () => {
    expect([...allocateBundlePrice(900, [{ id: 'a', monthlyPriceCents: 0 }, { id: 'b', monthlyPriceCents: 0 }]).values()]).toEqual([450, 450]);
  });
});
