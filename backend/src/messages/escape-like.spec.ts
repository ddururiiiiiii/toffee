import { describe, expect, it } from 'vitest';
import { escapeLike } from '../common/utils/escape-like.js';

describe('escapeLike', () => {
  it('LIKE 특수문자(%, _, \\)를 글자 그대로 찾게 이스케이프', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('c:\\x')).toBe('c:\\\\x');
    expect(escapeLike('캐러멜')).toBe('캐러멜');
  });
});
