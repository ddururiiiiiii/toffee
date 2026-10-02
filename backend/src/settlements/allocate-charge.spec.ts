import { describe, expect, it } from 'vitest';
import { addMonths, allocateCharge } from './allocate-charge.js';

describe('allocateCharge', () => {
  it('개인방은 그 아티스트가 전부', () => {
    expect(allocateCharge(12900, [{ id: 'a', monthlyPriceCents: 12900, memberIds: ['a'] }])).toEqual([{ roomId: 'a', actorId: 'a', amountCents: 12900 }]);
  });

  it('커플방은 두 아티스트가 반씩(홀수는 마지막에)', () => {
    expect(allocateCharge(19901, [{ id: 'c', monthlyPriceCents: 19901, memberIds: ['a', 'b'] }])).toEqual([
      { roomId: 'c', actorId: 'a', amountCents: 9951 },
      { roomId: 'c', actorId: 'b', amountCents: 9950 },
    ]);
  });

  it('묶음(A + B + 커플방 AB)은 정가 비율로 나눈 뒤 커플방 몫을 다시 반씩 — 합은 결제 금액과 같음', () => {
    // 3,000 + 3,000 + 6,000 정가를 8,000에 팜 → 2,000 / 2,000 / 4,000 → 커플방 4,000은 2,000씩
    const lines = allocateCharge(8000, [
      { id: 'a', monthlyPriceCents: 3000, memberIds: ['a'] },
      { id: 'b', monthlyPriceCents: 3000, memberIds: ['b'] },
      { id: 'ab', monthlyPriceCents: 6000, memberIds: ['a', 'b'] },
    ]);
    expect(lines).toEqual([
      { roomId: 'a', actorId: 'a', amountCents: 2000 },
      { roomId: 'b', actorId: 'b', amountCents: 2000 },
      { roomId: 'ab', actorId: 'a', amountCents: 2000 },
      { roomId: 'ab', actorId: 'b', amountCents: 2000 },
    ]);
    expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(8000);
  });

  it('반올림이 생겨도 합이 정확함', () => {
    const lines = allocateCharge(17900, [
      { id: 'a', monthlyPriceCents: 12900, memberIds: ['a'] },
      { id: 'b', monthlyPriceCents: 9900, memberIds: ['b'] },
      { id: 'ab', monthlyPriceCents: 14900, memberIds: ['a', 'b'] },
    ]);
    expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(17900);
  });
});

describe('addMonths', () => {
  it('달 길이에 맞춤', () => {
    expect(addMonths(new Date('2026-01-31T05:00:00Z'), 1).toISOString()).toBe('2026-02-28T05:00:00.000Z');
    expect(addMonths(new Date('2026-01-31T05:00:00Z'), 2).toISOString()).toBe('2026-03-31T05:00:00.000Z');
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString()).toBe('2027-02-15T00:00:00.000Z');
  });
});
