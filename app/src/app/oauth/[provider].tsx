import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { consumeRedirectState, isRedirectProvider, redirectUriFor } from '@/lib/social-sign-in.web';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

/**
 * PC 웹 소셜 로그인 돌아오는 곳(/oauth/kakao|naver|line|apple, 2026-09-29) — 회사 로그인 페이지가 ?code=&state=를 붙여 돌려보냄. state가 떠날 때
 * 저장한 것과 같을 때만 서버(/auth/<회사>/web)에 code를 보내 로그인. 로그인되면 AuthGate가 역할에 맞는 첫 화면으로 보냄.
 */
export default function OAuthCallbackScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const params = useLocalSearchParams<{ provider: string; code?: string; state?: string; error?: string }>();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // 새로고침·재렌더로 같은 code를 두 번 보내지 않게(code는 1회용)
    if (started.current || Platform.OS !== 'web') return;
    started.current = true;
    const provider = params.provider;
    const fail = () => setFailed(true);
    if (!provider || !isRedirectProvider(provider) || params.error || !params.code || !consumeRedirectState(provider, params.state)) {
      void Promise.resolve().then(fail);
      return;
    }
    apiClient
      .post<{ accessToken: string }>(`/auth/${provider}/web`, { code: params.code, state: params.state, redirectUri: redirectUriFor(provider) })
      .then((data) => login(data.accessToken))
      .catch(fail);
  }, [login, params]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {failed ? (
        <>
          <ThemedText type="headline">{t('login.socialFailed')}</ThemedText>
          <Button title={t('login.backToLogin')} onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={theme.tint} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('login.signingIn')}
          </ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
});
