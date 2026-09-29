import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { orderedProviders, PROVIDER_STYLE } from '@/components/social-button-style';
import { availableProviders, GOOGLE_WEB_CLIENT_ID, isRedirectProvider, startRedirectLogin } from '@/lib/social-sign-in.web';
import { Radius, Spacing } from '@/constants/theme';
import type { SocialCredential } from '@/lib/social-types';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void; ux_mode?: 'popup' }) => void;
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoading: Promise<GoogleIdentity> | null = null;

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const existing = (window as unknown as { google?: GoogleIdentity }).google;
  if (existing?.accounts?.id) return Promise.resolve(existing);
  gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve((window as unknown as { google: GoogleIdentity }).google);
    script.onerror = () => {
      gisLoading = null;
      reject(new Error('GIS load failed'));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

/**
 * 웹 로그인 버튼(2026-09-29) — 구글은 공식 버튼(Google Identity Services, 팝업 → idToken → 앱과 같은 POST /auth/google, 구글 콘솔
 * "승인된 JavaScript 원본"에 이 사이트 주소). 카카오·네이버·LINE·애플은 누르면 그 회사 로그인 페이지로 이동했다가 /oauth/<회사>로 돌아옴
 * (app/oauth/[provider].tsx). 키가 없는 로그인은 안 보임.
 */
export function SocialLoginButtons({
  onCredential,
  onError,
}: {
  onCredential: (credential: SocialCredential) => void;
  onError: (message: string | null) => void;
  busy?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const container = useRef<View>(null);

  useEffect(() => {
    if (!GOOGLE_WEB_CLIENT_ID) return;
    let cancelled = false;
    loadGoogleIdentity()
      .then((google) => {
        const element = container.current as unknown as HTMLElement | null;
        if (cancelled || !element) return;
        google.accounts.id.initialize({
          client_id: GOOGLE_WEB_CLIENT_ID!,
          ux_mode: 'popup',
          callback: (response) => {
            if (response.credential) onCredential({ provider: 'google', body: { idToken: response.credential } });
            else onError(t('login.socialFailed'));
          },
        });
        element.innerHTML = '';
        google.accounts.id.renderButton(element, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 320, locale: i18n.language });
      })
      .catch(() => onError(t('login.socialFailed')));
    return () => {
      cancelled = true;
    };
  }, [i18n.language, onCredential, onError, t]);

  const redirects = orderedProviders(availableProviders(), i18n.language).filter(isRedirectProvider);
  if (!GOOGLE_WEB_CLIENT_ID && redirects.length === 0) return null;
  return (
    <View style={styles.list}>
      {redirects.map((provider) => {
        const look = PROVIDER_STYLE[provider];
        return (
          <Pressable
            key={provider}
            onPress={() => startRedirectLogin(provider)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              // 애플(검정)은 어두운 배경에서 안 보여서 얇은 테두리(앱 버튼과 같음)
              { backgroundColor: look.background, opacity: pressed ? 0.85 : 1, borderWidth: look.border ? 1 : 0, borderColor: look.border },
            ]}>
            <ThemedText type="smallBold" style={{ color: look.text }}>
              {t(`login.continueWith.${provider}`)}
            </ThemedText>
          </Pressable>
        );
      })}
      {GOOGLE_WEB_CLIENT_ID ? <View ref={container} style={styles.google} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  button: { height: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  google: { alignItems: 'center', minHeight: 44 },
});
