import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ReceiptText } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useIdleRefunds, useRequestIdleRefund, type IdleRefundCandidate } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { confirm } from '@/lib/confirm';
import { Radius, Spacing } from '@/constants/theme';
import { formatPrice } from '@/utils/price';

/**
 * 스타 미발송 환불(2026-09-29) — 구독 관리 맨 위. 이용 기간 동안 스타 메시지가 하나도 없었던 결제가 있으면(기간 끝난 뒤 7일 안) 카드로
 * 보여 주고 환불 요청. 테스트·구글 결제는 바로 환불, 애플 결제는 우리가 환불할 수 없어서 애플 환불 요청 페이지를 엶. 대상이 없으면 안 보임.
 */
export function IdleRefundSection() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { data } = useIdleRefunds();
  // 요청·결과 안내는 구역에서 — 환불되면 그 카드는 목록에서 빠져서(카드 안에 두면 결과를 못 보여 줌)
  const request = useRequestIdleRefund();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<{ chargeId: string; message: string } | null>(null);
  const submit = (item: IdleRefundCandidate) => {
    setError(null);
    request.mutate(item.chargeId, {
      onSuccess: (result) => {
        if (result.url) void Linking.openURL(result.url);
        setNotice(result.status === 'REFUNDED' ? t('idleRefund.refunded') : t('idleRefund.guided'));
      },
      onError: (e) => setError({ chargeId: item.chargeId, message: e instanceof ApiError ? e.message : t('idleRefund.failed') }),
    });
  };
  if (!data?.length && !notice) return null;
  return (
    <View style={styles.section}>
      {data?.length ? <ThemedText type="headline">{t('idleRefund.title')}</ThemedText> : null}
      {notice ? (
        <View style={[styles.notice, { backgroundColor: theme.tintSoft }]}>
          <ThemedText type="small">{notice}</ThemedText>
        </View>
      ) : null}
      {data?.map((item) => (
        <RefundCard
          key={item.chargeId}
          item={item}
          onRequest={() => submit(item)}
          busy={request.isPending && request.variables === item.chargeId}
          error={error?.chargeId === item.chargeId ? error.message : null}
        />
      ))}
    </View>
  );
}

function RefundCard({ item, onRequest, busy, error }: { item: IdleRefundCandidate; onRequest: () => void; busy: boolean; error: string | null }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);
  // 이용 기간 마지막 날(끝 시각 직전)
  const lastDay = date(new Date(new Date(item.periodEnd).getTime() - 1).toISOString());
  const apple = item.source === 'APPLE';

  const start = async () => {
    const ok = await confirm(
      t('idleRefund.confirmTitle'),
      apple ? t('idleRefund.confirmApple') : t('idleRefund.confirmBody', { amount: formatPrice(t, item.amountCents) }),
      apple ? t('idleRefund.requestApple') : t('idleRefund.request'),
      t('common.cancel'),
    );
    if (ok) onRequest();
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.head}>
        <Icon as={ReceiptText} size={20} color={theme.tint} />
        <View style={styles.body}>
          <ThemedText type="smallBold">{item.productName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('idleRefund.reason', { from: date(item.chargedAt), to: lastDay })}
          </ThemedText>
          <ThemedText type="caption" themeColor="textTertiary">
            {t('idleRefund.deadline', { date: date(item.deadline), amount: formatPrice(t, item.amountCents) })}
          </ThemedText>
        </View>
      </View>
      {item.requested === 'STORE_GUIDED' ? (
        <ThemedText type="caption" themeColor="textTertiary">
          {t('idleRefund.guidedBefore')}
        </ThemedText>
      ) : null}
      <Button title={apple ? t('idleRefund.requestApple') : t('idleRefund.request')} size="md" variant="secondary" loading={busy} onPress={() => void start()} />
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three, marginBottom: Spacing.two },
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  head: { flexDirection: 'row', gap: Spacing.three },
  body: { flex: 1, gap: 2 },
  notice: { borderRadius: Radius.lg, padding: Spacing.three },
});
