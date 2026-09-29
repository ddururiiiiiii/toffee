import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, Monitor } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import {
  currentMonth,
  downloadSettlementCsv,
  shiftMonth,
  useSettlement,
  type SettlementActor,
  type SettlementAgency,
  type SettlementAmounts,
} from '@/hooks/use-settlements';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { Radius, Spacing } from '@/constants/theme';

function useMoney() {
  const { i18n } = useTranslation();
  const format = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 });
  return (cents: number) => format.format(cents / 100);
}

/**
 * 월 정산 표(2026-09-29) — 운영자(전체, 소속사 골라 보기)와 소속사 콘솔(자기 소속사만, 서버가 좁힘)이 같이 씀. 정산은 표가 크고
 * 민감해서 PC 웹에서만 보여 줌(2026-09-28 결정) — 폰 앱에선 안내만.
 */
export function SettlementReportView({ agencyFilter }: { agencyFilter?: { id: string; name: string }[] }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(currentMonth);
  const [agencyId, setAgencyId] = useState<string | undefined>(undefined);
  const [includeSandbox, setIncludeSandbox] = useState<boolean | undefined>(undefined);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { data: report, isLoading, isFetching, error } = useSettlement(month, { agencyId, includeSandbox });

  if (Platform.OS !== 'web') {
    return <EmptyState icon={Monitor} title={t('settlement.webOnly')} body={t('settlement.webOnlyBody')} />;
  }

  const [year, mon] = month.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(year, mon - 1, 15)).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', timeZone: 'UTC' });
  const isCurrent = month === currentMonth();
  const download = (detail: boolean) => {
    setDownloadError(null);
    downloadSettlementCsv(month, { agencyId, includeSandbox }, detail).catch((e: unknown) =>
      setDownloadError(e instanceof ApiError ? e.message : t('settlement.downloadFailed')),
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {/* 달 고르기 · 테스트 결제 · 내려받기 */}
      <View style={styles.toolbar}>
        <View style={styles.monthNav}>
          <IconButton icon={ChevronLeft} label={t('settlement.prevMonth')} onPress={() => setMonth(shiftMonth(month, -1))} />
          <ThemedText type="title" style={styles.monthLabel}>
            {monthLabel}
          </ThemedText>
          <IconButton icon={ChevronRight} label={t('settlement.nextMonth')} onPress={() => setMonth(shiftMonth(month, 1))} disabled={isCurrent} />
          {isFetching ? <ActivityIndicator color={theme.textTertiary} /> : null}
        </View>
        <View style={styles.actions}>
          {report?.sandboxEnabled ? (
            <View style={styles.toggle}>
              <Switch value={report.includesSandbox} onValueChange={setIncludeSandbox} />
              <ThemedText type="small" themeColor="textSecondary">
                {t('settlement.includeSandbox')}
              </ThemedText>
            </View>
          ) : null}
          <ToolbarButton label={t('settlement.csvActors')} onPress={() => download(false)} />
          <ToolbarButton label={t('settlement.csvRooms')} onPress={() => download(true)} />
        </View>
      </View>

      {agencyFilter && agencyFilter.length > 0 ? (
        <View style={styles.chips}>
          {[{ id: undefined as string | undefined, name: t('settlement.allAgencies') }, ...agencyFilter].map((agency) => {
            const selected = agencyId === agency.id;
            return (
              <Pressable
                key={agency.id ?? 'all'}
                onPress={() => setAgencyId(agency.id)}
                style={[styles.chip, { backgroundColor: selected ? theme.primary : theme.backgroundElement }]}
                accessibilityRole="button"
                accessibilityState={{ selected }}>
                <ThemedText type="smallMedium" style={{ color: selected ? theme.onPrimary : theme.text }}>
                  {agency.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {downloadError ? (
        <ThemedText type="small" themeColor="danger">
          {downloadError}
        </ThemedText>
      ) : null}

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : error || !report ? (
        <ThemedText type="small" themeColor="danger">
          {error instanceof ApiError ? error.message : t('settlement.loadFailed')}
        </ThemedText>
      ) : (
        <>
          <SummaryCards totals={report.totals} storeFeePercent={report.storeFeePercent} />
          {report.includesSandbox ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('settlement.sandboxIncluded')}
            </ThemedText>
          ) : null}
          {report.agencies.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {t('settlement.empty')}
            </ThemedText>
          ) : (
            report.agencies.map((agency) => <AgencyTable key={agency.agencyId ?? 'none'} agency={agency} />)
          )}
          <ThemedText type="caption" themeColor="textTertiary" style={styles.note}>
            {t('settlement.note', { fee: report.storeFeePercent, share: report.defaultSharePercent })}
          </ThemedText>
        </>
      )}
    </ScrollView>
  );
}

function ToolbarButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.toolbarButton, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      <Icon as={Download} size={16} color={theme.text} />
      <ThemedText type="smallMedium">{label}</ThemedText>
    </Pressable>
  );
}

function SummaryCards({ totals, storeFeePercent }: { totals: SettlementAmounts; storeFeePercent: number }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const money = useMoney();
  const cards = [
    { label: t('settlement.gross'), value: totals.grossCents },
    { label: t('settlement.storeFee', { percent: storeFeePercent }), value: totals.storeFeeCents },
    { label: t('settlement.net'), value: totals.netCents },
    { label: t('settlement.payout'), value: totals.payoutCents, strong: true },
    { label: t('settlement.platform'), value: totals.platformCents },
    { label: t('settlement.refunded'), value: totals.refundedCents },
  ];
  return (
    <View style={styles.cards}>
      {cards.map((card) => (
        <View key={card.label} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {card.label}
          </ThemedText>
          <ThemedText type="headline" style={card.strong ? { color: theme.tint } : undefined}>
            {money(card.value)}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const COLUMNS: { key: keyof SettlementAmounts | 'chargeCount'; label: string }[] = [
  { key: 'chargeCount', label: 'settlement.charges' },
  { key: 'grossCents', label: 'settlement.gross' },
  { key: 'storeFeeCents', label: 'settlement.storeFeeShort' },
  { key: 'netCents', label: 'settlement.net' },
  { key: 'payoutCents', label: 'settlement.payout' },
  { key: 'platformCents', label: 'settlement.platform' },
  { key: 'refundedCents', label: 'settlement.refunded' },
];

function AgencyTable({ agency }: { agency: SettlementAgency }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const money = useMoney();
  const cell = (row: SettlementAmounts & { chargeCount?: number }, key: (typeof COLUMNS)[number]['key']) =>
    key === 'chargeCount' ? String(row.chargeCount ?? '') : money(row[key]);
  return (
    <View style={[styles.table, { borderColor: theme.border }]}>
      <View style={[styles.tableTitle, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="headline">{agency.name ?? t('settlement.independent')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settlement.share', { percent: agency.sharePercent })}
        </ThemedText>
      </View>
      {/* 좁은 창에선 표를 옆으로 밀어 봄 */}
      <ScrollView horizontal contentContainerStyle={styles.tableScroll}>
        <View style={styles.tableInner}>
          <View style={[styles.tr, { borderBottomColor: theme.border }]}>
            <ThemedText type="smallBold" style={styles.nameCol}>
              {t('settlement.actor')}
            </ThemedText>
            {COLUMNS.map((column) => (
              <ThemedText key={column.key} type="smallBold" style={styles.numCol}>
                {t(column.label)}
              </ThemedText>
            ))}
          </View>
          {agency.actors.map((actor) => (
            <ActorRow key={actor.actorId} actor={actor} cell={cell} />
          ))}
          <View style={[styles.tr, styles.totalRow, { borderTopColor: theme.border }]}>
            <ThemedText type="smallBold" style={styles.nameCol}>
              {t('settlement.total')}
            </ThemedText>
            {COLUMNS.map((column) => (
              <ThemedText key={column.key} type="smallBold" style={styles.numCol}>
                {column.key === 'chargeCount' ? '' : cell(agency, column.key)}
              </ThemedText>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ActorRow({ actor, cell }: { actor: SettlementActor; cell: (row: SettlementActor, key: (typeof COLUMNS)[number]['key']) => string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const money = useMoney();
  return (
    <View style={[styles.tr, { borderBottomColor: theme.border }]}>
      <View style={styles.nameCol}>
        <ThemedText type="smallMedium">{actor.name}</ThemedText>
        {/* 이 배우 몫이 어느 방에서 나왔는지(개인방·커플방) */}
        <ThemedText type="caption" themeColor="textTertiary">
          {actor.rooms
            .map((room) => `${room.kind === 'COUPLE' ? t('settlement.coupleRoom', { name: room.name }) : t('settlement.soloRoom')} ${money(room.grossCents)}`)
            .join(' · ')}
        </ThemedText>
      </View>
      {COLUMNS.map((column) => (
        <ThemedText key={column.key} type="small" style={styles.numCol}>
          {cell(actor, column.key)}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  monthLabel: { minWidth: 160, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginRight: Spacing.two },
  toolbarButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, height: 36, borderRadius: Radius.pill },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: Radius.pill },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  card: { flexGrow: 1, flexBasis: 140, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.one },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, overflow: 'hidden' },
  tableTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', padding: Spacing.three, gap: Spacing.two },
  tableScroll: { flexGrow: 1 },
  tableInner: { flexGrow: 1, minWidth: 900 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  totalRow: { borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth },
  nameCol: { flex: 2, minWidth: 220, paddingRight: Spacing.two, gap: 2 },
  numCol: { flex: 1, minWidth: 96, textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  note: { marginTop: Spacing.two },
  loading: { marginTop: Spacing.six },
});
