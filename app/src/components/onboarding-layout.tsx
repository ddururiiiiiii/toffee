import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 가입 절차 공통 틀 — 위에 작은 워드마크와 단계 표시(약관 → 생년월일 → 닉네임), 큰 제목·설명, 내용, 아래 고정 버튼.
 * 모든 단계가 같은 자리·같은 모양이라 "지금 어디쯤인지"가 보이게.
 */
export function OnboardingLayout({
  step,
  totalSteps = 3,
  title,
  subtitle,
  children,
  footer,
}: {
  step?: number;
  totalSteps?: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <Image
              source={scheme === 'dark' ? require('@/../assets/brand/wordmark-white.png') : require('@/../assets/brand/wordmark-black.png')}
              style={styles.wordmark}
              contentFit="contain"
              accessibilityLabel="Toffee"
            />
            {step ? (
              <View style={styles.steps} accessibilityLabel={`${step}/${totalSteps}`}>
                {Array.from({ length: totalSteps }, (_, i) => (
                  <View key={i} style={[styles.step, { backgroundColor: i < step ? theme.tint : theme.border }]} />
                ))}
              </View>
            ) : null}
          </View>
          <ThemedText type="display">{title}</ThemedText>
          {subtitle ? (
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}
          <View style={styles.body}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // 가입 절차는 폼이라 목록 화면보다 좁게(520)
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, width: '100%', maxWidth: 520, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.three, marginBottom: Spacing.four },
  wordmark: { width: 84, height: 27 },
  steps: { flexDirection: 'row', gap: 6 },
  step: { width: 22, height: 4, borderRadius: 2 },
  subtitle: { marginTop: Spacing.two },
  body: { marginTop: Spacing.five, gap: Spacing.three },
  footer: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, paddingTop: Spacing.two, width: '100%', maxWidth: 520, alignSelf: 'center', gap: Spacing.two },
});
