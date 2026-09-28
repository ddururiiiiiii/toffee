import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useAdminActions, type AdminActionEntry } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/constants/theme';

// 운영자 화면은 운영자(한국어) 전용이라 의도적으로 다국어 처리 안 함
const ACTION_LABELS: Record<string, string> = {
  USER_SUSPEND: '회원 정지',
  USER_BAN: '영구차단',
  USER_REACTIVATE: '제재 해제',
  USER_ROLE: '역할 변경',
  REPORT_RESOLVE: '신고 승인',
  REPORT_DISMISS: '신고 기각',
  ACTOR_RETIRE: '배우 활동 종료',
  ACTOR_RESTORE: '배우 활동 재개',
};

function detailText(entry: AdminActionEntry): string {
  const d = entry.detail ?? {};
  const parts: string[] = [];
  if (typeof d.category === 'string') parts.push(`사유 ${d.category}`);
  if (typeof d.note === 'string' && d.note) parts.push(`메모 "${d.note}"`);
  if (typeof d.until === 'string') parts.push(`해제 ${new Date(d.until).toLocaleString('ko-KR')}`);
  if (typeof d.from === 'string' && typeof d.to === 'string') parts.push(`${d.from} → ${d.to}`);
  return parts.join(' · ');
}

/** 운영자 작업 기록 — 누가 언제 무엇을 했는지(최근 100건). 분쟁·문의 대응용이라 지우지 않음 */
export default function AdminActionsScreen() {
  const theme = useTheme();
  const { data, isLoading } = useAdminActions();
  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={data ?? []}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        isLoading ? (
          <ActivityIndicator color={theme.tint} style={styles.loading} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            아직 기록이 없어요.
          </ThemedText>
        )
      }
      renderItem={({ item }) => (
        <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.top}>
            <ThemedText type="smallBold">{ACTION_LABELS[item.action] ?? item.action}</ThemedText>
            <ThemedText type="caption" themeColor="textTertiary">
              {new Date(item.createdAt).toLocaleString('ko-KR')}
            </ThemedText>
          </View>
          <ThemedText type="small">
            대상: {item.targetName ?? item.targetId} · 처리: {item.adminName}
          </ThemedText>
          {detailText(item) ? (
            <ThemedText type="small" themeColor="textSecondary">
              {detailText(item)}
            </ThemedText>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.four, gap: Spacing.two },
  loading: { marginTop: Spacing.six },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  row: { borderRadius: Radius.md, padding: Spacing.three, gap: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
});
