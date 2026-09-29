import type { SocialCredential, SocialProvider } from './social-types';

export type { SocialCredential, SocialProvider } from './social-types';
export { SignInCancelledError } from './social-types';

/**
 * 소셜 로그인(웹, 2026-09-29) — PC 웹은 주로 소속사·운영자가 씀.
 * - 구글: 구글 공식 버튼(GIS)이 idToken을 바로 줌 → 앱과 같은 POST /auth/google(components/social-login-buttons.web.tsx).
 * - 카카오·네이버·LINE: 회사 로그인 페이지로 이동 → 우리 웹 /oauth/<회사>로 1회용 code가 돌아옴 → POST /auth/<회사>/web(서버가 비밀키로
 *   교환). 앱과 같은 회사 앱(카카오 앱·네이버 애플리케이션·LINE 채널)에 웹 플랫폼을 추가해 써야 같은 계정으로 로그인됨.
 * - 애플 웹 로그인은 Services ID·서명 키(.p8)가 필요해서 아직 없음(소속사·운영자는 다른 로그인으로).
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;
const WEB_KEYS = {
  kakao: process.env.EXPO_PUBLIC_WEB_KAKAO_REST_API_KEY || undefined,
  naver: process.env.EXPO_PUBLIC_WEB_NAVER_CLIENT_ID || undefined,
  line: process.env.EXPO_PUBLIC_WEB_LINE_CHANNEL_ID || undefined,
};
export type RedirectProvider = keyof typeof WEB_KEYS;
const STATE_KEY = 'toffee_oauth_state';

export function availableProviders(): SocialProvider[] {
  return [
    ...(GOOGLE_WEB_CLIENT_ID ? (['google'] as const) : []),
    ...(Object.keys(WEB_KEYS) as RedirectProvider[]).filter((provider) => WEB_KEYS[provider]),
  ];
}

export function isRedirectProvider(provider: string): provider is RedirectProvider {
  return provider in WEB_KEYS;
}

/** 로그인 뒤 돌아올 우리 주소 — 회사 콘솔의 Redirect URI와 서버 WEB_LOGIN_ORIGINS에 이 주소(의 origin)를 등록 */
export function redirectUriFor(provider: RedirectProvider): string {
  return `${window.location.origin}/oauth/${provider}`;
}

/** 회사 로그인 페이지로 이동 — state(무작위)를 이 탭에 저장해 두고 돌아왔을 때 같은지 확인(다른 사람이 만든 로그인 링크 방지) */
export function startRedirectLogin(provider: RedirectProvider) {
  const clientId = WEB_KEYS[provider];
  if (!clientId) return;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(STATE_KEY, `${provider}:${state}`);
  const redirectUri = redirectUriFor(provider);
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state });
  const base =
    provider === 'kakao'
      ? 'https://kauth.kakao.com/oauth/authorize'
      : provider === 'naver'
        ? 'https://nid.naver.com/oauth2.0/authorize'
        : 'https://access.line.me/oauth2/v2.1/authorize';
  // LINE은 idToken을 받으려면 openid 범위가 필요
  if (provider === 'line') params.set('scope', 'profile openid');
  window.location.assign(`${base}?${params.toString()}`);
}

/** 돌아온 state가 떠날 때 저장한 것과 같은지(한 번 쓰면 지움) */
export function consumeRedirectState(provider: RedirectProvider, state: string | undefined): boolean {
  const saved = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return !!state && saved === `${provider}:${state}`;
}

export async function signIn(provider: SocialProvider): Promise<SocialCredential> {
  throw new Error(`${provider}: web sign-in uses the provider button or redirect`);
}

export async function signOutProviders(): Promise<void> {
  // 구글 자동 선택만 끔(다음에 계정 고르게)
  (globalThis as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }).google?.accounts?.id?.disableAutoSelect?.();
}
