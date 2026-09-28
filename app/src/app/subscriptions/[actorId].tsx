import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SearchX } from 'lucide-react-native';

import { MembershipBenefits } from '@/components/membership-benefits';
import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { confirm } from '@/lib/confirm';
import { useMySubscriptions, useUnsubscribe } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { formatPrice } from '@/utils/price';

/**
 * 구독 상세 — DESIGN_GUIDE §11: 상태·월 요금·다음 결제일·자동 갱신 안내·혜택·해지.
 * 다음 결제일·결제 수단은 스토어 결제가 붙으면 스토어 정보로(지금은 테스트 구독이라 "스토어에서 확인").
 */
export default function SubscriptionDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { actorId } = useLocalSearchParams<{ actorId: string }>();
  const { data: subscriptions } = useMySubscriptions();
  const sub = subscriptions?.find((s) => s.actorId === actorId);
  const unsubscribe = useUnsubscribe(actorId);

  if (!sub) {
    return <EmptyState icon={SearchX} title={t('manage.notFound')} />;
  }

  const cancel = async () => {
    const ok = await confirm(
      t('mypage.unsubscribeTitle'),
      t('mypage.unsubscribeConfirm', { name: sub.actor.chatDisplayName }),
      t('mypage.unsubscribe'),
      t('common.cancel'),
    );
    if (ok) unsubscribe.mutate(undefined, { onSuccess: () => router.back() });
  };

  const rows: [string, string][] = [
    [t('manage.status'), t('manage.active')],
    [t('manage.price'), `${formatPrice(t, sub.actor.monthlyPriceCents)} ${t('actorProfile.perMonth')}`],
    [t('manage.started'), new Date(sub.startedAt).toLocaleDateString(i18n.language)],
    [t('manage.nextBilling'), t('manage.nextBillingStore')],
  ];

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll}>
      <View style={styles.head}>
        <Avatar uri={sub.actor.chatProfileImageUrl} name={sub.actor.chatDisplayName} size={72} />
        <ThemedText type="title">{sub.actor.chatDisplayName}</ThemedText>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
            <ThemedText type="smallMedium">{value}</ThemedText>
          </View>
        ))}
        <ThemedText type="caption" themeColor="textTertiary">
          {t('manage.autoRenew')}
        </ThemedText>
      </View>

      <ThemedText type="headline" style={styles.sectionTitle}>
        {t('manage.benefits')}
      </ThemedText>
      <MembershipBenefits name={sub.actor.chatDisplayName} detailed />

      <View style={styles.actions}>
        <Button title={t('manage.openChat')} onPress={() => router.push(`/chat/${actorId}`)} />
        <Button title={t('manage.cancel')} variant="danger" loading={unsubscribe.isPending} onPress={cancel} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  head: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  card: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  sectionTitle: { marginTop: Spacing.three },
  actions: { gap: Spacing.two, marginTop: Spacing.four },
});
