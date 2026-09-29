import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { availableProviders, signIn, SignInCancelledError, type SocialCredential, type SocialProvider } from '@/lib/social-sign-in';
import { Radius, Spacing } from '@/constants/theme';
import { orderedProviders, PROVIDER_STYLE } from '@/components/social-button-style';

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
  const providers = orderedProviders(availableProviders(), i18n.language);
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
        const look = PROVIDER_STYLE[provider];
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
