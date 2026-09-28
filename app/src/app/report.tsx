import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { REPORT_CATEGORIES, useReportMessage, type ReportCategory } from '@/hooks/use-safety';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';

// 메시지 신고(팬·스타·소속사 공용) — 운영자 대기열로만 가고, 신고한 쪽에게 결과를 따로 알리진 않음
export default function ReportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [reason, setReason] = useState('');
  const report = useReportMessage();

  if (report.isSuccess) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ThemedView style={styles.content}>
          <ThemedText type="subtitle">{t('report.doneTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('report.doneBody')}</ThemedText>
          <Pressable onPress={() => router.back()} style={[styles.submit, { backgroundColor: theme.tint }]}>
            <ThemedText style={styles.submitText}>{t('media.close')}</ThemedText>
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ThemedView style={styles.content}>
        <ThemedText themeColor="textSecondary">{t('report.hint')}</ThemedText>
        <ThemedView style={styles.categories}>
          {REPORT_CATEGORIES.map((value) => {
            const selected = category === value;
            return (
              <Pressable
                key={value}
                onPress={() => setCategory(value)}
                style={[styles.chip, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
                <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
                  {t(`report.category.${value}`)}
                </ThemedText>
              </Pressable>
            );
          })}
        </ThemedView>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder={t('report.reasonPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={500}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        {report.isError && (
          <ThemedText type="small" themeColor="danger">
            {report.error instanceof ApiError ? report.error.message : t('report.failed')}
          </ThemedText>
        )}
        <Pressable
          onPress={() => category && report.mutate({ messageId, category, reason: reason.trim() || undefined })}
          disabled={!category || report.isPending}
          style={[styles.submit, { backgroundColor: theme.tint, opacity: category ? 1 : 0.5 }]}>
          {report.isPending ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>{t('report.submit')}</ThemedText>}
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, backgroundColor: 'transparent' },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipTextSelected: { color: '#fff' },
  input: { borderWidth: 1, borderRadius: 10, padding: Spacing.three, minHeight: 90, fontSize: 15, textAlignVertical: 'top' },
  submit: { borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '600' },
});
