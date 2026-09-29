import type { SocialCredential, SocialProvider } from './social-types';

export type { SocialCredential, SocialProvider } from './social-types';
export { SignInCancelledError } from './social-types';

/**
 * 소셜 로그인(웹, 2026-09-29) — PC 웹은 주로 소속사·운영자가 씀. 구글만 붙임(구글 공식 버튼 GIS가 idToken을 바로 줘서 서버 확인이
 * 앱과 같음). 카카오·네이버·LINE·애플 웹 로그인은 리디렉트 방식이라 서버 쪽 교환 코드가 더 필요 — 필요해지면 추가.
 * 버튼은 components/social-login-buttons.web.tsx가 구글 공식 버튼을 그려서 처리하므로 signIn은 쓰지 않음.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;

export function availableProviders(): SocialProvider[] {
  return GOOGLE_WEB_CLIENT_ID ? ['google'] : [];
}

export async function signIn(provider: SocialProvider): Promise<SocialCredential> {
  throw new Error(`${provider}: web sign-in uses the provider button`);
}

export async function signOutProviders(): Promise<void> {
  // 구글 자동 선택만 끔(다음에 계정 고르게)
  (globalThis as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }).google?.accounts?.id?.disableAutoSelect?.();
}
