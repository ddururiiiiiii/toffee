/** 소셜 로그인 공통 타입 — 앱(social-sign-in.ts)과 웹(social-sign-in.web.ts)이 같이 씀 */
export type SocialProvider = 'apple' | 'google' | 'line' | 'kakao' | 'naver';

/** 서버 POST /auth/<provider>에 그대로 보낼 본문 — 구글·애플·LINE은 idToken, 카카오·네이버는 accessToken */
export interface SocialCredential {
  provider: SocialProvider;
  body: Record<string, string>;
}

export class SignInCancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}
