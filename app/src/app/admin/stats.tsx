import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AdminChip, AdminSection, formatBaht } from '@/components/admin-ui';
import { DailyBars, RankBars } from '@/components/simple-charts';
import { useAdminStatsBreakdown, useAdminStatsDaily, useAdminStatsSummary } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

const PERIODS = [7, 30, 90] as const;
const COUNTRY_NAMES: Record<string, string> = { TH: '태국', KR: '한국', JP: '일본', TW: '대만', CN: '중국', HK: '홍콩', US: '미국', unknown: '알 수 없음' };
const PROVIDER_NAMES: Record<string, string> = { GOOGLE: '구글', APPLE: '애플', NAVER: '네이버', KAKAO: '카카오', LINE: '라인', unknown: '알 수 없음' };
const PLATFORM_NAMES: Record<string, string> = { ios: 'iOS', android: '안드로이드', web: '웹', unknown: '알 수 없음' };
const LOCALE_NAMES: Record<string, string> = { ko: '한국어', th: '태국어', en: '영어', ja: '일본어', 'zh-Hans': '중국어(간체)', 'zh-Hant': '중국어(번체)', vi: '베트남어', unknown: '기기 언어' };

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.metric, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.metricValue}>
        {value}
      </ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

// 운영자 통계 — 폰에선 한 줄로, PC(넓은 화면)에선 두 줄로. 날짜 기준은 태국 시간.
export default function AdminStatsScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const { data: summary } = useAdminStatsSummary();
  const { data: daily, isLoading } = useAdminStatsDaily(days);
  const { data: breakdown } = useAdminStatsBreakdown();
  const dayLabels = daily?.map((d) => d.day) ?? [];
  const pick = (key: 'signups' | 'subscriptionsStarted' | 'subscriptionsCancelled' | 'newRevenueCents' | 'starMessages' | 'fanReplies') =>
    daily?.map((d) => d[key]) ?? [];
  const cell = [styles.cell, wide && styles.cellWide];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]}>
        {summary && (
          <ThemedView style={styles.metrics}>
            <Metric label="전체 팬" value={String(summary.fans.total)} hint={`오늘 +${summary.fans.newToday} · 7일 +${summary.fans.new7d}`} />
            <Metric label="구독률" value={`${Math.round(summary.subscriptions.subscriptionRate * 100)}%`} hint={`구독 중인 팬 ${summary.subscriptions.subscribedFans}명`} />
            <Metric label="활성 구독" value={String(summary.subscriptions.active)} hint={`30일 시작 ${summary.subscriptions.started30d} · 해지 ${summary.subscriptions.cancelled30d}`} />
            <Metric label="접속" value={`${summary.fans.activeToday}`} hint={`오늘 · 30일 ${summary.fans.active30d}명`} />
            <Metric label="대기 중인 신고" value={String(summary.reports.pending)} />
            <Metric label="오늘 메시지" value={`${summary.messages.starToday} / ${summary.messages.fanRepliesToday}`} hint="아티스트 / 팬 답장" />
          </ThemedView>
        )}

        <ThemedView style={styles.periods}>
          {PERIODS.map((p) => (
            <AdminChip key={p} label={`최근 ${p}일`} selected={days === p} onPress={() => setDays(p)} />
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            태국 시간 기준
          </ThemedText>
        </ThemedView>

        {isLoading ? (
          <ActivityIndicator color={theme.tint} />
        ) : (
          <ThemedView style={styles.grid}>
            <ThemedView style={cell}>
              <AdminSection title="신규 가입">
                <DailyBars days={dayLabels} series={[{ label: '가입', values: pick('signups'), color: theme.tint }]} />
              </AdminSection>
            </ThemedView>
            <ThemedView style={cell}>
              <AdminSection title="구독 시작 · 해지">
                <DailyBars
                  days={dayLabels}
                  series={[
                    { label: '시작', values: pick('subscriptionsStarted'), color: theme.tint },
                    { label: '해지', values: pick('subscriptionsCancelled'), color: theme.danger },
                  ]}
                />
              </AdminSection>
            </ThemedView>
            <ThemedView style={cell}>
              <AdminSection title="신규 구독 금액" hint="그날 새로 시작한 구독의 월 가격 합(할인 반영). 정산·갱신 매출은 결제 연동 후.">
                <DailyBars
                  days={dayLabels}
                  series={[{ label: '합계', values: pick('newRevenueCents'), color: theme.tint }]}
                  format={formatBaht}
                />
              </AdminSection>
            </ThemedView>
            <ThemedView style={cell}>
              <AdminSection title="메시지">
                <DailyBars
                  days={dayLabels}
                  series={[
                    { label: '아티스트 메시지', values: pick('starMessages'), color: theme.tint },
                    { label: '팬 답장', values: pick('fanReplies'), color: theme.textSecondary },
                  ]}
                />
              </AdminSection>
            </ThemedView>
          </ThemedView>
        )}

        {breakdown && (
          <ThemedView style={styles.grid}>
            <ThemedView style={cell}>
              <AdminSection title="국가" hint="가입할 때 기기 지역 설정 기준">
                <RankBars rows={breakdown.countries} labelOf={(k) => COUNTRY_NAMES[k] ?? k} />
              </AdminSection>
            </ThemedView>
            <ThemedView style={cell}>
              <AdminSection title="가입 경로" hint="처음 가입한 로그인 방식">
                <RankBars rows={breakdown.providers} labelOf={(k) => PROVIDER_NAMES[k] ?? k} />
              </AdminSection>
            </ThemedView>
            <ThemedView style={cell}>
              <AdminSection title="가입 기기">
                <RankBars rows={breakdown.platforms} labelOf={(k) => PLATFORM_NAMES[k] ?? k} />
              </AdminSection>
            </ThemedView>
            <ThemedView style={cell}>
              <AdminSection title="앱 언어">
                <RankBars rows={breakdown.locales} labelOf={(k) => LOCALE_NAMES[k] ?? k} />
              </AdminSection>
            </ThemedView>
            <ThemedView style={[styles.cell, styles.full]}>
              <AdminSection title="아티스트별 구독" hint="최근 30일">
                {breakdown.actors.map((actor) => (
                  <ThemedView key={actor.id} style={[styles.actorRow, { borderBottomColor: theme.backgroundSelected }]}>
                    <ThemedText type="smallBold" style={styles.actorName}>
                      {actor.name} ({actor.nickname})
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      구독 중 {actor.activeSubscribers} · 시작 {actor.started30d} · 해지 {actor.cancelled30d} · 신규{' '}
                      {formatBaht(actor.newRevenue30dCents)}
                    </ThemedText>
                  </ThemedView>
                ))}
              </AdminSection>
            </ThemedView>
            <ThemedView style={[styles.cell, styles.full]}>
              <AdminSection
                title="앱 오류"
                hint="오류 발생 추이는 Sentry 화면에서 봐요(Sentry 프로젝트·키 연결 후 — 운영 할 일 목록 참고)."
              />
            </ThemedView>
          </ThemedView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  contentWide: { maxWidth: 1200, width: '100%', alignSelf: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, backgroundColor: 'transparent' },
  metric: { flexGrow: 1, flexBasis: 150, borderRadius: 14, padding: Spacing.three, gap: 2 },
  metricValue: { fontSize: 26, lineHeight: 32 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two, backgroundColor: 'transparent' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, backgroundColor: 'transparent' },
  cell: { width: '100%', backgroundColor: 'transparent' },
  cellWide: { width: '48.5%' },
  full: { width: '100%' },
  actorRow: { paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2, backgroundColor: 'transparent' },
  actorName: {},
});
