import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useAdminRefunds, type AdminRefundEntry } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/constants/theme';

// 운영자 화면은 운영자(한국어) 전용이라 의도적으로 다국어 처리 안 함
const REASON_LABELS: Record<AdminRefundEntry['reason'], string> = { STAR_IDLE: '아티스트 미발송', ACTOR_RETIRED: '활동 종료' };
const SOURCE_LABELS: Record<AdminRefundEntry['source'], string> = { SANDBOX: '테스트', APPLE: '애플', GOOGLE: '구글' };
const FILTERS: { value: AdminRefundEntry['reason'] | undefined; label: string }[] = [
  { value: undefined, label: '전체' },
  { value: 'STAR_IDLE', label: '아티스트 미발송' },
  { value: 'ACTOR_RETIRED', label: '활동 종료' },
];

const money = (cents: number) => `฿${(cents / 100).toLocaleString('ko-KR')}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR');

/** 상태 — 우리가 환불 완료 / 애플 안내 후 애플이 환불함 / 애플 안내만(팬이 아직 안 했거나 애플이 거절) */
function statusOf(entry: AdminRefundEntry): { label: string; done: boolean } {
  if (entry.status === 'REFUNDED') return { label: '환불 완료', done: true };
  return entry.refundedAt ? { label: '애플 환불 완료', done: true } : { label: '애플 안내함 · 아직 환불 안 됨', done: false };
}

/**
 * 환불 요청 목록(2026-09-29) — 최근 200건. 고객 문의("환불 요청했는데요") 대응, 애플 안내 건이 실제로 환불됐는지, 어느 배우·소속사에서
 * 환불이 자주 나오는지(계약 대화 근거). 환불된 금액은 정산에서 자동으로 빠짐.
 */
export default function AdminRefundsScreen() {
  const theme = useTheme();
  const [reason, setReason] = useState<AdminRefundEntry['reason'] | undefined>(undefined);
  const { data, isLoading } = useAdminRefunds(reason);
  const rows = data ?? [];
  const refundedCents = rows.filter((row) => statusOf(row).done).reduce((sum, row) => sum + row.amountCents, 0);
  const waiting = rows.filter((row) => !statusOf(row).done).length;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.chips}>
            {FILTERS.map((filter) => {
              const selected = reason === filter.value;
              return (
                <Pressable
                  key={filter.label}
                  onPress={() => setReason(filter.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.chip, { backgroundColor: selected ? theme.primary : theme.backgroundElement }]}>
                  <ThemedText type="smallMedium" style={{ color: selected ? theme.onPrimary : theme.text }}>
                    {filter.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {rows.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {rows.length}건 · 환불된 금액 {money(refundedCents)}
              {waiting > 0 ? ` · 애플 안내 후 아직 환불 안 됨 ${waiting}건` : ''}
            </ThemedText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        isLoading ? (
          <ActivityIndicator color={theme.tint} style={styles.loading} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            아직 환불 요청이 없어요.
          </ThemedText>
        )
      }
      renderItem={({ item }) => {
        const status = statusOf(item);
        const agencies = item.agencies.map((name) => name ?? '무소속').join(', ');
        return (
          <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.top}>
              <ThemedText type="smallBold">
                {REASON_LABELS[item.reason]} · {item.productName} · {money(item.amountCents)}
              </ThemedText>
              <ThemedText type="captionBold" style={{ color: status.done ? theme.tint : theme.danger }}>
                {status.label}
              </ThemedText>
            </View>
            <ThemedText type="small">
              팬: {item.fan ? `${item.fan.name}${item.fan.email ? ` (${item.fan.email})` : ''}` : '탈퇴한 회원'} · {SOURCE_LABELS[item.source]} 결제
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              아티스트 {item.actors.join(', ')} · {agencies} · 이용 기간 {day(item.chargedAt)} ~ {day(new Date(new Date(item.periodEnd).getTime() - 1).toISOString())}
            </ThemedText>
            <ThemedText type="caption" themeColor="textTertiary">
              요청 {new Date(item.requestedAt).toLocaleString('ko-KR')}
              {item.refundedAt ? ` · 환불 ${new Date(item.refundedAt).toLocaleString('ko-KR')}` : ''}
            </ThemedText>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.four, gap: Spacing.two, width: '100%', maxWidth: 900, alignSelf: 'center' },
  header: { gap: Spacing.two, marginBottom: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: Radius.pill },
  loading: { marginTop: Spacing.six },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  row: { borderRadius: Radius.md, padding: Spacing.three, gap: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.two },
});
