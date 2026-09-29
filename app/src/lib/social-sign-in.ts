import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login as kakaoLogin } from '@react-native-kakao/user';
import NaverLogin from '@react-native-seoul/naver-login';
import LineLogin, { Scope as LineScope } from '@xmartlabs/react-native-line';

import { SignInCancelledError, type SocialCredential, type SocialProvider } from './social-types';

export type { SocialCredential, SocialProvider } from './social-types';
export { SignInCancelledError } from './social-types';

/**
 * 소셜 로그인(앱) — 젤리(gelly/app/src/auth/social-sign-in.ts)를 출발점으로 2026-09-29 미리 작성. 각 SDK로 로그인해 받은 토큰을
 * 서버(/auth/<provider>)가 해당 회사 API로 다시 확인함. 키가 없는 로그인은 버튼 자체를 안 보여 줌(availableProviders) — 콘솔 등록 전에도
 * 앱이 그대로 빌드·동작하게. 웹은 social-sign-in.web.ts(구글만).
 * 토피는 안드로이드 패키지명도 운영/개발이 달라서(.dev) 모든 플랫폼에서 운영·개발 앱(키)을 나눔(app.config.ts와 같은 규칙).
 */
const IS_PRODUCTION_VARIANT = Constants.expoConfig?.extra?.isProductionVariant === true;
const variant = (prod: string | undefined, dev: string | undefined) => (IS_PRODUCTION_VARIANT ? prod : dev) || undefined;

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;
const GOOGLE_IOS_CLIENT_ID = variant(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID_PROD, process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID_DEV);
const KAKAO_NATIVE_APP_KEY = variant(process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY_PROD, process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY_DEV);
const NAVER = {
  consumerKey: variant(process.env.EXPO_PUBLIC_NAVER_CONSUMER_KEY_PROD, process.env.EXPO_PUBLIC_NAVER_CONSUMER_KEY_DEV),
  consumerSecret: variant(process.env.EXPO_PUBLIC_NAVER_CONSUMER_SECRET_PROD, process.env.EXPO_PUBLIC_NAVER_CONSUMER_SECRET_DEV),
  urlScheme: variant(process.env.EXPO_PUBLIC_NAVER_URL_SCHEME_PROD, process.env.EXPO_PUBLIC_NAVER_URL_SCHEME_DEV),
};
const LINE_CHANNEL_ID = variant(process.env.EXPO_PUBLIC_LINE_CHANNEL_ID_PROD, process.env.EXPO_PUBLIC_LINE_CHANNEL_ID_DEV);

// 구글: webClientId가 idToken의 audience가 됨 — 서버 GOOGLE_CLIENT_ID와 같은 값이어야 함
if (GOOGLE_WEB_CLIENT_ID) GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
if (KAKAO_NATIVE_APP_KEY) void initializeKakaoSDK(KAKAO_NATIVE_APP_KEY);
if (NAVER.consumerKey && NAVER.consumerSecret) {
  NaverLogin.initialize({
    appName: 'Toffee',
    consumerKey: NAVER.consumerKey,
    consumerSecret: NAVER.consumerSecret,
    serviceUrlSchemeIOS: NAVER.urlScheme ?? '',
    disableNaverAppAuthIOS: true,
  });
}
// LINE setup이 끝나기 전에 login()을 부르면 네이티브 크래시 — 로그인 때 이 Promise를 기다림(젤리에서 겪은 문제)
const lineSetup: Promise<void> | null = LINE_CHANNEL_ID ? LineLogin.setup({ channelId: LINE_CHANNEL_ID }) : null;

/** 이 기기에서 쓸 수 있는(키가 설정된) 로그인 — 애플은 iOS만(안드로이드 애플 로그인은 웹 인증이 필요해서 제외) */
export function availableProviders(): SocialProvider[] {
  const list: SocialProvider[] = [];
  if (Platform.OS === 'ios') list.push('apple');
  if (GOOGLE_WEB_CLIENT_ID && (Platform.OS !== 'ios' || GOOGLE_IOS_CLIENT_ID)) list.push('google');
  if (LINE_CHANNEL_ID) list.push('line');
  if (KAKAO_NATIVE_APP_KEY) list.push('kakao');
  if (NAVER.consumerKey && NAVER.consumerSecret) list.push('naver');
  return list;
}

function isCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return String(error.code).toUpperCase().includes('CANCEL');
}

/** 로그인 창을 띄워 서버에 보낼 자격 증명을 받음 — 사용자가 닫으면 SignInCancelledError */
export async function signIn(provider: SocialProvider): Promise<SocialCredential> {
  try {
    switch (provider) {
      case 'apple': {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        });
        if (!credential.identityToken) throw new Error('Apple: no identityToken');
        // 이름은 처음 로그인할 때만 옴 — 서버가 그때 저장
        const name = credential.fullName ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ') : '';
        return { provider, body: { idToken: credential.identityToken, ...(name ? { name } : {}) } };
      }
      case 'google': {
        await GoogleSignin.hasPlayServices();
        const response = await GoogleSignin.signIn();
        if (!isSuccessResponse(response)) throw new SignInCancelledError();
        if (!response.data.idToken) throw new Error('Google: no idToken');
        return { provider, body: { idToken: response.data.idToken } };
      }
      case 'kakao': {
        const { accessToken } = await kakaoLogin();
        return { provider, body: { accessToken } };
      }
      case 'naver': {
        const { successResponse, failureResponse } = await NaverLogin.login();
        if (!successResponse) {
          if (failureResponse?.isCancel) throw new SignInCancelledError();
          throw new Error(failureResponse?.message ?? 'Naver login failed');
        }
        return { provider, body: { accessToken: successResponse.accessToken } };
      }
      case 'line': {
        if (!lineSetup) throw new Error('LINE: not configured');
        await lineSetup;
        // email 범위는 LINE 콘솔 승인 후에만 요청 가능 — 승인 전엔 빼 둠(이메일 없이도 가입됨)
        const { accessToken } = await LineLogin.login({ scopes: [LineScope.Profile, LineScope.OpenId] });
        if (!accessToken.idToken) throw new Error('LINE: no idToken');
        return { provider, body: { idToken: accessToken.idToken } };
      }
    }
  } catch (error) {
    if (error instanceof SignInCancelledError) throw error;
    if (isCancelled(error) || (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED')) {
      throw new SignInCancelledError();
    }
    throw error;
  }
}

/** 로그아웃할 때 SDK 쪽 세션도 정리(다음에 다른 계정을 고를 수 있게) — 실패해도 무시 */
export async function signOutProviders(): Promise<void> {
  await Promise.allSettled([GOOGLE_WEB_CLIENT_ID ? GoogleSignin.signOut() : null, NAVER.consumerKey ? NaverLogin.logout() : null]);
}
