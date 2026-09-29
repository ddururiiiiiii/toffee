import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { availableProviders, signIn, SignInCancelledError, type SocialCredential, type SocialProvider } from '@/lib/social-sign-in';
import { Radius, Spacing } from '@/constants/theme';

// 각 회사 로그인 버튼 색(브랜드 가이드) — 공식 로고 이미지는 콘솔 등록 때 받아서 교체
const STYLE: Record<SocialProvider, { background: string; text: string; border?: string }> = {
  apple: { background: '#000000', text: '#FFFFFF', border: 'rgba(255,255,255,0.35)' },
  google: { background: '#FFFFFF', text: '#1F1F1F' },
  line: { background: '#06C755', text: '#FFFFFF' },
  kakao: { background: '#FEE500', text: '#191919' },
  naver: { background: '#03C75A', text: '#FFFFFF' },
};

// 나라마다 많이 쓰는 로그인을 위로 — 한국어면 카카오·네이버, 그 외(태국·일본·대만)는 LINE
function ordered(providers: SocialProvider[], language: string): SocialProvider[] {
  const order: SocialProvider[] = language.startsWith('ko') ? ['kakao', 'naver', 'apple', 'google', 'line'] : ['line', 'apple', 'google', 'kakao', 'naver'];
  return order.filter((provider) => providers.includes(provider));
}

/** 소셜 로그인 버튼들(앱) — 키가 설정된 로그인만. 받은 자격 증명을 onCredential로(서버 로그인은 화면이 함) */
export function SocialLoginButtons({
  onCredential,
  onError,
  busy,
}: {
  onCredential: (credential: SocialCredential) => void;
  onError: (message: string | null) => void;
  busy?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const providers = ordered(availableProviders(), i18n.language);
  if (providers.length === 0) return null;

  const start = (provider: SocialProvider) => {
    onError(null);
    setPending(provider);
    signIn(provider)
      .then(onCredential)
      .catch((error: unknown) => {
        if (!(error instanceof SignInCancelledError)) onError(t('login.socialFailed'));
      })
      .finally(() => setPending(null));
  };

  return (
    <View style={styles.list}>
      {providers.map((provider) => {
        const look = STYLE[provider];
        return (
          <Pressable
            key={provider}
            onPress={() => start(provider)}
            disabled={!!pending || busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: look.background, opacity: pressed ? 0.85 : 1 },
              look.border ? { borderWidth: 1, borderColor: look.border } : null,
            ]}>
            {pending === provider ? (
              <ActivityIndicator color={look.text} />
            ) : (
              <ThemedText type="smallBold" style={{ color: look.text }}>
                {t(`login.continueWith.${provider}`)}
              </ThemedText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  button: { height: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
