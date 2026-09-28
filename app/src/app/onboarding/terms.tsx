import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { OnboardingLayout } from '@/components/onboarding-layout';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAcceptTerms } from '@/hooks/use-onboarding';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { Radius, Spacing } from '@/constants/theme';

type Agreement = 'terms' | 'privacy';

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
    <OnboardingLayout
      step={1}
      title={t('termsConsent.title')}
      subtitle={t('termsConsent.hint')}
      footer={
        <>
          {accept.isError ? (
            <ThemedText type="small" themeColor="danger">
              {accept.error instanceof ApiError ? accept.error.message : t('onboarding.saveFailed')}
            </ThemedText>
          ) : null}
          <Button title={t('termsConsent.submit')} disabled={!all} loading={accept.isPending} onPress={() => accept.mutate()} />
        </>
      }>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Checkbox bold checked={all} label={t('termsConsent.all')} onToggle={() => setAgreed({ terms: !all, privacy: !all })} />
      </View>
      <View style={styles.items}>
        <Row checked={agreed.terms} label={t('termsConsent.terms')} onToggle={() => toggle('terms')} onView={() => router.push('/terms')} />
        <Row checked={agreed.privacy} label={t('termsConsent.privacy')} onToggle={() => toggle('privacy')} onView={() => router.push('/privacy')} />
      </View>
    </OnboardingLayout>
  );
}

function Row({ checked, label, onToggle, onView }: { checked: boolean; label: string; onToggle: () => void; onView: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Checkbox checked={checked} label={label} onToggle={onToggle} />
      <Pressable onPress={onView} hitSlop={8} accessibilityRole="link">
        <ThemedText type="smallMedium" themeColor="textSecondary" style={styles.view}>
          {t('termsConsent.view')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  items: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  view: { textDecorationLine: 'underline' },
});
