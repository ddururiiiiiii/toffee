import { describe, expect, it } from 'vitest';
import { decideSeed, isDemoServer } from './demo-mode.js';

describe('데모 데이터 넣기 판단', () => {
  it('운영에선 어떤 값이어도 실행하지 않음', () => {
    expect(decideSeed('reset', 'production')).toBe('skip-production');
    expect(decideSeed('true', 'production')).toBe('skip-production');
  });

  it('true는 빈 DB일 때만, reset은 항상, 그 밖의 값은 건너뜀', () => {
    expect(decideSeed('true', 'development')).toBe('seed-if-empty');
    expect(decideSeed('reset', 'development')).toBe('reset');
    expect(decideSeed('yes', 'development')).toBe('skip-unknown');
  });

  it('데모 초기화 버튼은 데모 서버에서만', () => {
    expect(isDemoServer('true', 'development')).toBe(true);
    expect(isDemoServer('reset', 'development')).toBe(true);
    expect(isDemoServer(undefined, 'development')).toBe(false);
    expect(isDemoServer('true', 'production')).toBe(false);
  });
});
