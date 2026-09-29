import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GOOGLE_WEB_CLIENT_ID } from '@/lib/social-sign-in.web';
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
 * 웹 로그인 버튼(2026-09-29) — 구글 공식 버튼(Google Identity Services). 누르면 구글 팝업 → idToken(credential)을 받아 앱과 같은
 * POST /auth/google로. 클라이언트 ID(EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)가 없으면 아무것도 안 그림. 구글 콘솔의 "승인된 JavaScript
 * 원본"에 이 사이트 주소를 넣어야 함.
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

  if (!GOOGLE_WEB_CLIENT_ID) return null;
  return <View ref={container} style={{ alignItems: 'center', minHeight: 44 }} />;
}
