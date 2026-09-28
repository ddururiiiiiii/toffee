import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 차트 라이브러리 없이 View로 그리는 막대그래프 — 앱·웹 어디서나 같게 보이고 의존성이 없음(운영자 통계용).

/** 날짜별 세로 막대(최대 90개). series가 2개면 나란히 */
export function DailyBars({
  days,
  series,
  format = (value) => String(value),
}: {
  days: string[];
  series: { label: string; values: number[]; color: string }[];
  format?: (value: number) => string;
}) {
  const theme = useTheme();
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const total = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const labelEvery = Math.ceil(days.length / 6);
  return (
    <ThemedView style={styles.transparent}>
      <ThemedView style={styles.legend}>
        {series.map((s) => (
          <ThemedView key={s.label} style={styles.legendItem}>
            <ThemedView style={[styles.swatch, { backgroundColor: s.color }]} />
            <ThemedText type="small" themeColor="textSecondary">
              {s.label} {format(total(s.values))}
            </ThemedText>
          </ThemedView>
        ))}
      </ThemedView>
      <ThemedView style={[styles.plot, { borderBottomColor: theme.backgroundSelected }]}>
        {days.map((day, i) => (
          <ThemedView key={day} style={styles.column}>
            <ThemedView style={styles.bars}>
              {series.map((s) => (
                <ThemedView
                  key={s.label}
                  accessibilityLabel={`${day} ${s.label} ${format(s.values[i])}`}
                  style={[styles.bar, { height: `${(s.values[i] / max) * 100}%`, backgroundColor: s.color }]}
                />
              ))}
            </ThemedView>
          </ThemedView>
        ))}
      </ThemedView>
      <ThemedView style={styles.axis}>
        {days.map((day, i) => (
          <ThemedText key={day} type="small" themeColor="textSecondary" style={styles.axisLabel} numberOfLines={1}>
            {i % labelEvery === 0 ? day.slice(5) : ''}
          </ThemedText>
        ))}
      </ThemedView>
    </ThemedView>
  );
}

/** 항목별 가로 막대(국가·가입 경로 등) — 비율도 같이 */
export function RankBars({ rows, labelOf = (key) => key }: { rows: { key: string; count: number }[]; labelOf?: (key: string) => string }) {
  const theme = useTheme();
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        아직 데이터가 없어요.
      </ThemedText>
    );
  }
  return (
    <ThemedView style={styles.rankList}>
      {rows.map((row) => (
        <ThemedView key={row.key} style={styles.rankRow}>
          <ThemedText type="small" style={styles.rankLabel} numberOfLines={1}>
            {labelOf(row.key)}
          </ThemedText>
          <ThemedView style={[styles.rankTrack, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedView style={[styles.rankFill, { width: `${(row.count / max) * 100}%`, backgroundColor: theme.tint }]} />
          </ThemedView>
          <ThemedText type="small" themeColor="textSecondary" style={styles.rankValue}>
            {row.count} ({Math.round((row.count / total) * 100)}%)
          </ThemedText>
        </ThemedView>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  transparent: { backgroundColor: 'transparent', gap: Spacing.one },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, backgroundColor: 'transparent' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'transparent' },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  plot: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, backgroundColor: 'transparent' },
  column: { flex: 1, height: '100%', justifyContent: 'flex-end', backgroundColor: 'transparent' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 1, backgroundColor: 'transparent' },
  bar: { flex: 1, minHeight: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axis: { flexDirection: 'row', gap: 2, backgroundColor: 'transparent' },
  axisLabel: { flex: 1, fontSize: 10, overflow: 'visible' },
  rankList: { gap: Spacing.one, backgroundColor: 'transparent' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, backgroundColor: 'transparent' },
  rankLabel: { width: 90 },
  rankTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  rankFill: { height: '100%', borderRadius: 5 },
  rankValue: { width: 80, textAlign: 'right' },
});
