import { describe, expect, it } from 'vitest';
import { checkEnv } from './env-check.js';

const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(40) };

describe('서버 시작 설정 점검', () => {
  it('필수값이 없으면 오류', () => {
    expect(checkEnv({}).errors).toEqual(['DATABASE_URL 필요', 'JWT_SECRET 필요']);
  });

  it('운영에서 테스트 로그인·무료 구독을 켜 두면 오류', () => {
    const { errors } = checkEnv({ ...base, NODE_ENV: 'production', API_PUBLIC_URL: 'https://api', ENABLE_DEV_LOGIN: 'true', ENABLE_SANDBOX_SUBSCRIBE: 'true' });
    expect(errors).toHaveLength(2);
  });

  it('운영에서 짧은 JWT_SECRET·공개 주소 없음은 오류, 개발에선 괜찮음', () => {
    expect(checkEnv({ ...base, JWT_SECRET: 'short', NODE_ENV: 'production' }).errors).toHaveLength(2);
    expect(checkEnv({ ...base, JWT_SECRET: 'short' }).errors).toHaveLength(0);
  });

  it('외부 서비스 키가 없으면 경고만(기능이 꺼진 채 켜짐)', () => {
    const { errors, warnings } = checkEnv(base);
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.startsWith('파일 저장소'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('부모 동의 메일'))).toBe(false);
  });

  it('테스트 로그인이 입장 코드 없이 열려 있으면 경고', () => {
    const open = (extra: Record<string, string>) => checkEnv({ ...base, ENABLE_DEV_LOGIN: 'true', ...extra }).warnings.some((w) => w.startsWith('테스트 로그인'));
    expect(open({})).toBe(true);
    expect(open({ DEV_LOGIN_CODE: 'candy' })).toBe(false);
  });
});
