import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

export default function LoginScreen() {
  const theme = useTheme();
  const { login } = useAuth();
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
          좋아하는 배우와 1:1로 대화해보세요
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.form}>
          <ThemedText type="smallBold">이메일로 데모 로그인</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            소셜 로그인은 실제 앱 크리덴셜이 생기면 여기 자리에 붙어요. 지금은 이메일만으로 전체 플로우를
            테스트할 수 있어요.
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
            placeholder="닉네임 (선택)"
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
              <ThemedText style={styles.buttonText}>로그인</ThemedText>
            )}
          </Pressable>
          {devLogin.isError && (
            <ThemedText themeColor="danger" type="small">
              {devLogin.error instanceof ApiError ? devLogin.error.message : '로그인에 실패했어요.'}
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
