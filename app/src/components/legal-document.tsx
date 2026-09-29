import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CloudOff } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useLegalSections } from '@/hooks/use-legal';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

/** 약관·개인정보처리방침 화면 공통 — 초안 안내(앱 언어) + 서버에서 받은 본문(초안은 한국어만) */
export function LegalDocument({ doc }: { doc: 'terms' | 'privacy' }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useLegalSections(doc);
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={[styles.draftNotice, { backgroundColor: theme.tintSoft }]}>
          <ThemedText type="smallBold">{t('legal.draftTitle')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('legal.draftBody')}
          </ThemedText>
          {t('legal.koreanOnly') !== '' && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('legal.koreanOnly')}
            </ThemedText>
          )}
        </ThemedView>
        {isLoading ? <ActivityIndicator color={theme.tint} /> : null}
        {isError ? (
          <EmptyState icon={CloudOff} title={t('legal.loadFailed')} action={<Button title={t('discover.retry')} variant="secondary" onPress={() => void refetch()} />} />
        ) : null}
        {data?.sections.map((section) => (
          <ThemedView key={section.title} style={styles.section}>
            <ThemedText type="smallBold">{section.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {section.body}
            </ThemedText>
          </ThemedView>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  draftNotice: { borderRadius: 12, padding: Spacing.three, gap: 4 },
  section: { gap: Spacing.two },
});
