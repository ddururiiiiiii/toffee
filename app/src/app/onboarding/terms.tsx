import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAcceptTerms } from '@/hooks/use-onboarding';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';

type Agreement = 'terms' | 'privacy';

function CheckRow({
  checked,
  label,
  onToggle,
  onView,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  onView?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.checkRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={onToggle}
        style={styles.checkPressable}>
        <ThemedView
          style={[
            styles.box,
            { borderColor: checked ? theme.tint : theme.backgroundSelected, backgroundColor: checked ? theme.tint : 'transparent' },
          ]}>
          {checked && <ThemedText style={styles.checkMark}>✓</ThemedText>}
        </ThemedView>
        <ThemedText style={styles.checkLabel}>{label}</ThemedText>
      </Pressable>
      {onView && (
        <Pressable onPress={onView} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('termsConsent.view')}
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

// 온보딩 첫 단계(모든 계정) — 필수 동의 두 가지를 받고 서버에 버전·시각을 기록. 약관이 바뀌면 다시 여기로 옴.
export default function TermsOnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const accept = useAcceptTerms();
  const [agreed, setAgreed] = useState<Record<Agreement, boolean>>({ terms: false, privacy: false });
  const all = agreed.terms && agreed.privacy;
  const toggle = (key: Agreement) => setAgreed((current) => ({ ...current, [key]: !current[key] }));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" style={styles.title}>
          {t('termsConsent.title')}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          {t('termsConsent.hint')}
        </ThemedText>

        <ThemedView style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <CheckRow checked={all} label={t('termsConsent.all')} onToggle={() => setAgreed({ terms: !all, privacy: !all })} />
          <ThemedView style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
          <CheckRow
            checked={agreed.terms}
            label={t('termsConsent.terms')}
            onToggle={() => toggle('terms')}
            onView={() => router.push('/terms')}
          />
          <CheckRow
            checked={agreed.privacy}
            label={t('termsConsent.privacy')}
            onToggle={() => toggle('privacy')}
            onView={() => router.push('/privacy')}
          />
        </ThemedView>

        <Pressable
          onPress={() => accept.mutate()}
          disabled={!all || accept.isPending}
          style={[styles.button, { backgroundColor: theme.tint, opacity: all ? 1 : 0.5 }]}>
          {accept.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>{t('termsConsent.submit')}</ThemedText>
          )}
        </Pressable>
        {accept.isError && (
          <ThemedText themeColor="danger" type="small">
            {accept.error instanceof ApiError ? accept.error.message : t('onboarding.saveFailed')}
          </ThemedText>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.four, paddingVertical: Spacing.four },
  title: { textAlign: 'center', fontSize: 28, lineHeight: 36 },
  subtitle: { textAlign: 'center' },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.three },
  divider: { height: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, backgroundColor: 'transparent' },
  checkPressable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#fff', fontSize: 14, lineHeight: 16 },
  checkLabel: { flex: 1 },
  button: { borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
