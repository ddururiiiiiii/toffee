import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePendingReports, useResolveReport, useDismissReport, type PendingReport } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

function ReportRow({ report }: { report: PendingReport }) {
  const theme = useTheme();
  const resolve = useResolveReport();
  const dismiss = useDismissReport();
  const isPending = resolve.isPending || dismiss.isPending;

  return (
    <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{report.reportedBy.displayName}의 신고</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        사유: {report.reason}
      </ThemedText>
      {report.message.body && <ThemedText type="small">신고된 메시지: {report.message.body}</ThemedText>}
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
