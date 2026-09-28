import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

export default function LoginScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { login, signedOutReason } = useAuth();
  const [email, setEmail] = useState('fan1@toffee.demo');
  const [name, setName] = useState('');

  const devLogin = useMutation({
    mutationFn: () =>
      apiClient.post<{ accessToken: string }>('/auth/dev-login', { email, name: name || undefined }),
    onSuccess: (data) => login(data.accessToken),
  });

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Toffee
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          {t('login.tagline')}
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.form}>
          <ThemedText type="smallBold">{t('login.demoTitle')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('login.demoHint')}
          </ThemedText>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('login.namePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <Pressable
            onPress={() => devLogin.mutate()}
            disabled={devLogin.isPending || !email}
            style={[styles.button, { backgroundColor: theme.tint, opacity: devLogin.isPending ? 0.6 : 1 }]}>
            {devLogin.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>{t('login.submit')}</ThemedText>
            )}
          </Pressable>
          {signedOutReason && !devLogin.isError && (
            <ThemedText themeColor="danger" type="small">
              {signedOutReason}
            </ThemedText>
          )}
          {devLogin.isError && (
            <ThemedText themeColor="danger" type="small">
              {devLogin.error instanceof ApiError ? devLogin.error.message : t('login.failed')}
            </ThemedText>
          )}
        </ThemedView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.four },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: -Spacing.three },
  form: { borderRadius: 16, padding: Spacing.four, gap: Spacing.three },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  button: { borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
