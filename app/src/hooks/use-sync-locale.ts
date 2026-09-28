import { useEffect, useRef } from 'react';

import { useLocalePreference } from '@/i18n/locale-preference-context';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

/**
 * 앱 표시 언어를 백엔드 User.locale에 동기화 — 푸시 알림처럼 서버가 만드는 문구를 이 언어로 보내기 위함.
 * 로그인 직후, 그리고 언어가 바뀔 때마다(기기 언어 변경 또는 설정에서 직접 선택) 보냄.
 * 실패해도 조용히 무시 — 다음 로그인/변경 때 다시 시도됨.
 */
export function useSyncLocale(): void {
  const { token } = useAuth();
  const { locale } = useLocalePreference();
  const lastSynced = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      lastSynced.current = null;
      return;
    }
    const key = `${token}:${locale}`;
    if (lastSynced.current === key) return;
    lastSynced.current = key;
    apiClient.patch('/auth/me/locale', { locale }).catch(() => {
      lastSynced.current = null;
    });
  }, [token, locale]);
}
