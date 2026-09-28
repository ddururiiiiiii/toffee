import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePendingReports, useResolveReport, useDismissReport, type PendingReport } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { showNameToken } from '@/utils/name-token';

// 운영자 화면은 한국어 전용(운영자 본인용)
const CATEGORY_LABELS: Record<string, string> = {
  SPAM: '스팸·광고',
  ABUSE: '욕설·괴롭힘',
  SEXUAL: '음란·성적',
  PRIVACY: '개인정보 노출',
  OTHER: '기타',
};

function ReportRow({ report }: { report: PendingReport }) {
  const theme = useTheme();
  const resolve = useResolveReport();
  const dismiss = useDismissReport();
  const isPending = resolve.isPending || dismiss.isPending;

  return (
    <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">
        {report.reportCount > 1 ? `🔺 ${report.reportCount}명이 신고 · ` : ''}
        {report.categories.map((category) => CATEGORY_LABELS[category] ?? category).join(', ')}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {report.message.actor.chatDisplayName} 채널 ·{' '}
        {report.message.senderType === 'ARTIST'
          ? '배우 메시지'
          : `팬 답장 (${report.message.fanUser?.nickname ?? '-'} / ${report.message.fanUser?.displayName ?? '-'})`}
      </ThemedText>
      {report.message.body && <ThemedText type="small">신고된 메시지: {showNameToken(report.message.body, '팬 닉네임')}</ThemedText>}
      <ThemedText type="small" themeColor="textSecondary">
        첫 신고: {report.reportedBy.nickname ?? report.reportedBy.displayName} ({report.reportedBy.role})
        {report.reason ? ` — ${report.reason}` : ''}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {new Date(report.createdAt).toLocaleString('ko-KR')}
      </ThemedText>

      <ThemedView style={styles.actions}>
        <Pressable
          disabled={isPending}
          onPress={() => resolve.mutate(report.id)}
          style={[styles.actionButton, { backgroundColor: theme.tint }]}>
          <ThemedText type="small" style={styles.actionButtonText}>
            승인(처리함)
          </ThemedText>
        </Pressable>
        <Pressable
          disabled={isPending}
          onPress={() => dismiss.mutate(report.id)}
          style={[styles.actionButton, styles.dismissButton, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="small" themeColor="textSecondary">
            기각
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

export default function AdminReportsScreen() {
  const theme = useTheme();
  const { data: reports, isLoading } = usePendingReports();

  if (isLoading) return <ActivityIndicator style={styles.loading} color={theme.tint} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyMessage}>
            대기 중인 신고가 없어요.
          </ThemedText>
        }
        renderItem={({ item }) => <ReportRow report={item} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { borderRadius: 14, padding: Spacing.three, gap: 4 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  actionButton: { flex: 1, borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  actionButtonText: { color: '#fff' },
  dismissButton: { backgroundColor: 'transparent', borderWidth: 1 },
  emptyMessage: { textAlign: 'center', marginTop: Spacing.six },
  loading: { marginTop: Spacing.six },
});
