import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Send, Trash2 } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useSettlementPayouts, type SettlementPayout, type SettlementPayoutInput } from '@/hooks/use-settlements';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { confirm } from '@/lib/confirm';
import { Radius, Spacing } from '@/constants/theme';

/** 오늘(태국 시간) YYYY-MM-DD */
function todayInBangkok() {
  const local = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

/**
 * 마감한 달의 지급 상태 한 줄(2026-09-29) — 받는 쪽(소속사, 또는 무소속 배우 본인)마다. 보냈으면 언제·얼마·이체 번호, 안 보냈으면 보낼 금액.
 * 운영자(canRecord)는 여기서 "지급 기록"을 남기거나 잘못 적은 기록을 지움 — 실제 송금은 은행에서, 여기엔 기록만.
 */
export function PayoutBar({
  month,
  payee,
  label,
  dueCents,
  payout,
  canRecord,
  money,
}: {
  month: string;
  payee: Pick<SettlementPayoutInput, 'agencyId' | 'actorId'>;
  /** 무소속 배우처럼 받는 쪽 이름을 따로 보여 줄 때 */
  label?: string;
  dueCents: number;
  payout: SettlementPayout | undefined;
  canRecord?: boolean;
  money: (cents: number) => string;
}) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { record, remove } = useSettlementPayouts(month);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // 보낼 게 없는 받는 쪽(0원)은 줄 자체를 안 보여 줌 — 음수는 다음 달에 차감된다는 안내만
  if (!payout && dueCents === 0) return null;

  const startForm = () => {
    setAmount((dueCents / 100).toFixed(2));
    setPaidOn(todayInBangkok());
    setReference('');
    setMemo('');
    setFormError(null);
    setOpen(true);
  };
  const save = () => {
    const cents = Math.round(Number(amount.replace(/,/g, '')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setFormError(t('settlement.payoutAmountInvalid'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn))) return setFormError(t('settlement.payoutDateInvalid'));
    setFormError(null);
    // 날짜만 적으니 태국 시간 그날 정오로(어느 시간대에서 봐도 같은 날로 보이게)
    record.mutate(
      { ...payee, amountCents: cents, paidAt: `${paidOn}T12:00:00+07:00`, reference: reference || undefined, memo: memo || undefined },
      { onSuccess: () => setOpen(false), onError: (e) => setFormError(e instanceof ApiError ? e.message : t('settlement.closeFailed')) },
    );
  };
  const startRemove = async () => {
    if (!payout) return;
    if (await confirm(t('settlement.payoutDeleteTitle'), t('settlement.payoutDeleteConfirm'), t('settlement.payoutDelete'), t('common.cancel'))) {
      remove.mutate(payout.id);
    }
  };

  const who = label ? `${label} — ` : '';
  const paidDate = payout ? new Date(payout.paidAt).toLocaleDateString(i18n.language, { timeZone: 'Asia/Bangkok' }) : '';

  return (
    <View style={[styles.bar, { borderTopColor: theme.border }]}>
      <View style={styles.row}>
        {payout ? <Icon as={CircleCheck} size={16} color={theme.tint} /> : null}
        <ThemedText type="small" style={styles.flex} themeColor={payout ? 'text' : 'textSecondary'}>
          {payout
            ? who +
              t('settlement.paid', { date: paidDate, amount: money(payout.amountCents) }) +
              (payout.reference ? ` · ${t('settlement.payoutReference')} ${payout.reference}` : '') +
              (payout.amountCents !== dueCents ? ` · ${t('settlement.payoutDiffers', { amount: money(dueCents) })}` : '')
            : dueCents < 0
              ? who + t('settlement.payoutNegative', { amount: money(dueCents) })
              : who + t('settlement.unpaid', { amount: money(dueCents) })}
        </ThemedText>
        {canRecord && payout ? (
          <SmallButton label={t('settlement.payoutDelete')} icon={Trash2} onPress={() => void startRemove()} busy={remove.isPending} />
        ) : canRecord && dueCents > 0 && !open ? (
          <SmallButton label={t('settlement.payoutRecord')} icon={Send} onPress={startForm} />
        ) : null}
      </View>
      {payout?.memo ? (
        <ThemedText type="caption" themeColor="textTertiary">
          {payout.memo}
        </ThemedText>
      ) : null}
      {open ? (
        <View style={styles.form}>
          <View style={styles.fields}>
            <TextField
              label={t('settlement.payoutAmount')}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              containerStyle={styles.field}
            />
            <TextField
              label={t('settlement.payoutDate')}
              value={paidOn}
              onChangeText={setPaidOn}
              placeholder="YYYY-MM-DD"
              containerStyle={styles.field}
            />
            <TextField
              label={t('settlement.payoutReference')}
              value={reference}
              onChangeText={setReference}
              maxLength={200}
              containerStyle={styles.field}
            />
          </View>
          <TextField
            label={t('settlement.payoutMemo')}
            value={memo}
            onChangeText={setMemo}
            maxLength={1000}
          />
          {formError ? (
            <ThemedText type="small" themeColor="danger">
              {formError}
            </ThemedText>
          ) : null}
          <View style={styles.formActions}>
            <SmallButton label={t('common.cancel')} onPress={() => setOpen(false)} />
            <SmallButton label={t('settlement.payoutSave')} icon={CircleCheck} onPress={save} busy={record.isPending} primary />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SmallButton({ label, onPress, busy, icon, primary }: { label: string; onPress: () => void; busy?: boolean; icon?: typeof Send; primary?: boolean }) {
  const theme = useTheme();
  const fg = primary ? theme.onPrimary : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, { backgroundColor: primary ? theme.primary : theme.backgroundElement, opacity: pressed || busy ? 0.7 : 1 }]}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon as={icon} size={14} color={fg} /> : null}
      <ThemedText type="smallMedium" style={{ color: fg }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 32 },
  form: { gap: Spacing.two },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  field: { flexGrow: 1, flexBasis: 180 },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  button: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, height: 32, borderRadius: Radius.pill },
});
