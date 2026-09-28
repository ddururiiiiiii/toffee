import { describe, expect, it } from 'vitest';
import { fanTag, normalizeNickname } from './nickname.js';

describe('normalizeNickname', () => {
  it('공백 정리 후 통과', () => {
    expect(normalizeNickname('  캐러멜   러버 ')).toBe('캐러멜 러버');
    expect(normalizeNickname('น้องฟ้า')).toBe('น้องฟ้า');
  });
  it('빈 값·너무 긴 값·제어/보이지 않는 문자·예약어 거절', () => {
    expect(() => normalizeNickname('   ')).toThrow();
    expect(() => normalizeNickname('가'.repeat(21))).toThrow();
    expect(() => normalizeNickname('민​지')).toThrow();
    expect(() => normalizeNickname('캐러멜공식')).toThrow();
    expect(() => normalizeNickname('Toffee Admin')).toThrow();
  });
  it('태그는 id 끝 4자리 대문자', () => {
    expect(fanTag('6393d4ca-d22c-4484-b2ac-90c907883d30')).toBe('#3D30');
  });
});
