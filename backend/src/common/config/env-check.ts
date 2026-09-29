/**
 * 서버를 켤 때 설정값(환경변수) 점검(2026-09-29) — 호스팅에 올릴 때 빠뜨린 값을 "켜자마자" 알려주려고. 예전엔 해당 기능을
 * 처음 쓸 때(예: 첫 업로드·첫 푸시) 가서야 오류가 났음.
 * - errors: 이대로 켜면 안 되는 것(서버가 멈추고 로그에 이유) — 필수값 누락, 운영에서 켜 두면 위험한 테스트 기능
 * - warnings: 켜지긴 하지만 그 기능이 꺼진 채로 동작하는 것(파일 저장·푸시·오류 수집·소셜 로그인 등)
 */
export interface EnvCheckResult {
  errors: string[];
  warnings: string[];
}

type Env = Record<string, string | undefined>;

const has = (env: Env, key: string) => !!env[key]?.trim();

export function checkEnv(env: Env): EnvCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === 'production';

  for (const key of ['DATABASE_URL', 'JWT_SECRET']) if (!has(env, key)) errors.push(`${key} 필요`);

  if (production) {
    if ((env.JWT_SECRET ?? '').length < 32) errors.push('JWT_SECRET은 운영에서 32자 이상(무작위 값)');
    if (env.ENABLE_DEV_LOGIN === 'true') errors.push('ENABLE_DEV_LOGIN=true — 운영에서 켜면 누구나 아무 계정으로 로그인 가능');
    if (env.ENABLE_SANDBOX_SUBSCRIBE === 'true') errors.push('ENABLE_SANDBOX_SUBSCRIBE=true — 운영에서 켜면 결제 없이 구독 가능');
    if (!has(env, 'API_PUBLIC_URL')) errors.push('API_PUBLIC_URL 필요(메일 링크·공개 페이지 주소)');
  }

  const groups: [string, string[]][] = [
    ['파일 저장소(사진·음성·영상 업로드)', ['STORAGE_ENDPOINT', 'STORAGE_BUCKET', 'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY']],
    ['푸시 알림', ['FIREBASE_SERVICE_ACCOUNT_JSON']],
    ['오류 수집(Sentry)', ['SENTRY_DSN']],
    ['구글 로그인', ['GOOGLE_CLIENT_ID']],
    ['애플 로그인', ['APPLE_CLIENT_ID']],
    ['라인 로그인', ['LINE_CHANNEL_ID']],
    ['카카오 토큰 앱 확인', ['KAKAO_APP_ID']],
    ['메시지 번역(Claude)', ['ANTHROPIC_API_KEY']],
    ['PC 웹 소셜 로그인(카카오·네이버·LINE)', ['WEB_LOGIN_ORIGINS']],
    ['애플 결제 확인', ['APPLE_BUNDLE_ID', 'APPLE_APP_ID']],
    ['구글 결제 알림(갱신·만료·환불)', ['GOOGLE_RTDN_AUDIENCE', 'GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL']],
    ['구글 결제 확인', ['GOOGLE_PLAY_PACKAGE_NAME', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON']],
    ['고객센터 페이지 이메일', ['SUPPORT_EMAIL']],
  ];
  // 부모 동의 방식일 때만 메일이 필수(성인만 가입이면 안 씀)
  if (env.ADULTS_ONLY === 'false') groups.push(['부모 동의 메일', ['RESEND_API_KEY', 'EMAIL_FROM_ADDRESS']]);
  for (const [label, keys] of groups) {
    const missing = keys.filter((key) => !has(env, key));
    if (missing.length) warnings.push(`${label} 꺼짐 — ${missing.join(', ')} 없음`);
  }
  return { errors, warnings };
}
