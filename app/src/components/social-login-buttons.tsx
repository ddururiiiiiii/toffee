import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { availableProviders, signIn, SignInCancelledError, type SocialCredential, type SocialProvider } from '@/lib/social-sign-in';
import { Spacing } from '@/constants/theme';
import { orderedProviders } from '@/components/social-button-style';
import { SocialButton } from '@/components/social-button';

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
      {providers.map((provider) => (
        <SocialButton
          key={provider}
          provider={provider}
          label={t(`login.continueWith.${provider}`)}
          onPress={() => start(provider)}
          disabled={!!pending || busy}
          loading={pending === provider}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
});
