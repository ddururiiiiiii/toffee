import { describe, expect, it } from 'vitest';
import { monthRange, splitRevenue } from './settlements.service.js';

describe('정산 계산', () => {
  it('스토어 수수료 → 소속사 몫 / 토피 몫(반올림은 토피 몫에서)', () => {
    // ฿1,000 매출, 수수료 15%, 소속사 70% → 수수료 150, 남은 850 중 소속사 595, 토피 255
    expect(splitRevenue(100000, 15, 70)).toEqual({ grossCents: 100000, storeFeeCents: 15000, netCents: 85000, payoutCents: 59500, platformCents: 25500 });
    const odd = splitRevenue(12901, 15, 70);
    expect(odd.storeFeeCents + odd.payoutCents + odd.platformCents).toBe(12901);
  });

  it('한 달은 태국 시간 1일 0시부터', () => {
    const { from, to } = monthRange('2026-09');
    expect(from.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(monthRange('2026-12').to.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(() => monthRange('2026-13')).toThrow();
  });
});
