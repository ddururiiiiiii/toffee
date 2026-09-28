import { describe, expect, it } from 'vitest';
import { calculateAge, parseBirthDate } from './birth-date.js';

const NOW = new Date(Date.UTC(2026, 8, 28));

describe('parseBirthDate', () => {
  it('정상 날짜는 UTC 자정으로', () => {
    expect(parseBirthDate('1998-05-10', NOW).toISOString()).toBe('1998-05-10T00:00:00.000Z');
  });

  it('달력에 없는 날짜·형식 오류·미래·1900년 이전은 거절', () => {
    for (const value of ['2000-02-31', '2023-02-29', '1998-5-10', '1998/05/10', '2099-01-01', '1899-12-31', '']) {
      expect(() => parseBirthDate(value, NOW), value).toThrow('생년월일');
    }
    expect(parseBirthDate('2024-02-29', NOW).getUTCDate()).toBe(29);
  });
});

describe('calculateAge', () => {
  it('생일 전날/당일 경계', () => {
    expect(calculateAge(parseBirthDate('2012-09-29', NOW), NOW)).toBe(13);
    expect(calculateAge(parseBirthDate('2012-09-28', NOW), NOW)).toBe(14);
  });
});
