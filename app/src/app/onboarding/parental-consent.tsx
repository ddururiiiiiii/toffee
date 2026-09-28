import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRequestParentalConsent } from '@/hooks/use-onboarding';
import { ApiError } from '@/lib/api-client';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

export default function ParentalConsentOnboardingScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [parentEmail, setParentEmail] = useState('');
  const requestConsent = useRequestParentalConsent();

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          {t('onboarding.consentTitle')}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          {t('onboarding.consentHint')}
        </ThemedText>

        {requestConsent.isSuccess ? (
          <ThemedView type="backgroundElement" style={styles.pendingCard}>
            <ThemedText type="smallBold">{t('onboarding.consentSentTitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('onboarding.consentSentHint')}
            </ThemedText>
            <Pressable onPress={() => requestConsent.mutate(parentEmail)} disabled={requestConsent.isPending}>
              <ThemedText type="small" themeColor="tint">
                {t('onboarding.consentResend')}
              </ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <>
            <TextInput
              value={parentEmail}
              onChangeText={setParentEmail}
              placeholder={t('onboarding.parentEmailPlaceholder')}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <Pressable
              onPress={() => requestConsent.mutate(parentEmail)}
              disabled={!parentEmail.includes('@') || requestConsent.isPending}
              style={[styles.button, { backgroundColor: theme.tint, opacity: parentEmail.includes('@') ? 1 : 0.5 }]}>
              {requestConsent.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText}>{t('onboarding.consentSend')}</ThemedText>
              )}
            </Pressable>
            {requestConsent.isError && (
              <ThemedText themeColor="danger" type="small">
                {requestConsent.error instanceof ApiError ? requestConsent.error.message : t('onboarding.consentSendFailed')}
              </ThemedText>
            )}
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.four },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: -Spacing.three },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  button: { borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  pendingCard: { borderRadius: 14, padding: Spacing.four, gap: Spacing.two, alignItems: 'flex-start' },
});
