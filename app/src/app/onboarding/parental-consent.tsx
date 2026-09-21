import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRequestParentalConsent } from '@/hooks/use-onboarding';
import { ApiError } from '@/lib/api-client';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

export default function ParentalConsentOnboardingScreen() {
  const theme = useTheme();
  const [parentEmail, setParentEmail] = useState('');
  const requestConsent = useRequestParentalConsent();

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          법정대리인 동의가 필요해요
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          부모님(법정대리인) 이메일을 입력하면 동의 확인 메일을 보내드려요. 동의가 끝나야
          구독하고 대화를 나눌 수 있어요.
        </ThemedText>

        {requestConsent.isSuccess ? (
          <ThemedView type="backgroundElement" style={styles.pendingCard}>
            <ThemedText type="smallBold">메일을 보냈어요</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              부모님이 메일함에서 링크를 눌러 동의를 완료하면 자동으로 이용할 수 있게 돼요.
            </ThemedText>
            <Pressable onPress={() => requestConsent.mutate(parentEmail)} disabled={requestConsent.isPending}>
              <ThemedText type="small" themeColor="tint">
                메일 다시 보내기
              </ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <>
            <TextInput
              value={parentEmail}
              onChangeText={setParentEmail}
              placeholder="부모님 이메일"
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
                <ThemedText style={styles.buttonText}>동의 메일 보내기</ThemedText>
              )}
            </Pressable>
            {requestConsent.isError && (
              <ThemedText themeColor="danger" type="small">
                {requestConsent.error instanceof ApiError ? requestConsent.error.message : '메일을 보내지 못했어요.'}
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
