import { describe, expect, it } from 'vitest';
import { fanTag, nextNicknameChangeAt, normalizeNickname } from './nickname.js';

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

describe('nextNicknameChangeAt', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date(Date.UTC(2026, 8, 28, 12));
  it('처음 정하기 전엔 제한 없음', () => {
    expect(nextNicknameChangeAt({ nickname: null, nicknameChangedAt: null, createdAt: now }, now)).toBeNull();
  });
  it('가입 후 24시간 안엔 방금 바꿨어도 제한 없음', () => {
    const createdAt = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    expect(nextNicknameChangeAt({ nickname: 'a', nicknameChangedAt: now, createdAt }, now)).toBeNull();
  });
  it('24시간이 지나면 마지막 변경 + 7일', () => {
    const createdAt = new Date(now.getTime() - 2 * day);
    const changedAt = new Date(now.getTime() - day);
    expect(nextNicknameChangeAt({ nickname: 'a', nicknameChangedAt: changedAt, createdAt }, now)?.getTime()).toBe(changedAt.getTime() + 7 * day);
    expect(nextNicknameChangeAt({ nickname: 'a', nicknameChangedAt: new Date(now.getTime() - 8 * day), createdAt: new Date(0) }, now)).toBeNull();
  });
});

