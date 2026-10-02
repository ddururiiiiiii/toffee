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
import { openStoreSubscriptions, storeName } from '@/lib/store-subscriptions';
import { useCancelPurchase } from '@/hooks/use-bundles';
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
  const cancelPurchase = useCancelPurchase();

  if (!sub) {
    return <EmptyState icon={SearchX} title={t('manage.notFound')} />;
  }

  // 묶음으로만 열린 방이면 해지는 묶음 단위(묶음에 든 다른 배우 방도 같이 닫힘) — 개인 구독이 있으면 개인 구독 해지
  const single = sub.coveredBy.find((cover) => !cover.bundle);
  const bundleCover = single ? null : sub.coveredBy.find((cover) => cover.bundle);
  const cancelling = unsubscribe.isPending || cancelPurchase.isPending;
  // 스토어 결제 구독이면 해지는 스토어에서(앱이 끊으면 결제는 계속되고 방만 닫힘 — 서버도 409로 막음)
  const storePlatform = (single ?? bundleCover)?.iapPlatform;

  const cancel = async () => {
    if (storePlatform) {
      const ok = await confirm(
        t('manage.cancelInStore'),
        t('manage.cancelInStoreBody', { store: storeName(storePlatform) }),
        t('manage.openStore', { store: storeName(storePlatform) }),
        t('common.cancel'),
      );
      if (ok) void openStoreSubscriptions();
      return;
    }
    if (bundleCover?.bundle) {
      const ok = await confirm(
        t('bundle.cancelTitle'),
        t('bundle.cancelFromActor', { name: bundleCover.bundle.name }),
        t('bundle.cancel'),
        t('common.cancel'),
      );
      if (ok) cancelPurchase.mutate(bundleCover.purchaseId, { onSuccess: () => router.back() });
      return;
    }
    const ok = await confirm(
      t('mypage.unsubscribeTitle'),
      t('mypage.unsubscribeConfirm', { name: sub.actor.chatDisplayName }),
      t('mypage.unsubscribe'),
      t('common.cancel'),
    );
    if (ok) unsubscribe.mutate(undefined, { onSuccess: () => router.back() });
  };

  // 스토어에서 자동 갱신을 끈 방(2026-10-02) — "해지 예정" + 이용 종료일
  const endsOn = sub.endsAt ? new Date(sub.endsAt).toLocaleDateString(i18n.language) : null;
  const rows: [string, string][] = [
    [t('manage.status'), endsOn ? t('manage.ending') : t('manage.active')],
    bundleCover?.bundle
      ? [t('manage.price'), t('bundle.via', { name: bundleCover.bundle.name })]
      : [t('manage.price'), `${formatPrice(t, sub.actor.monthlyPriceCents)} ${t('actorProfile.perMonth')}`],
    [t('manage.started'), new Date(sub.startedAt).toLocaleDateString(i18n.language)],
    endsOn ? [t('manage.endsOn'), endsOn] : [t('manage.nextBilling'), t('manage.nextBillingStore')],
  ];

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll}>
      <View style={styles.head}>
        <Avatar uri={sub.actor.chatProfileImageUrl} size={72} />
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
          {endsOn ? t('manage.endingNote') : t('manage.autoRenew')}
        </ThemedText>
      </View>

      <ThemedText type="headline" style={styles.sectionTitle}>
        {t('manage.benefits')}
      </ThemedText>
      <MembershipBenefits name={sub.actor.chatDisplayName} detailed />

      <View style={styles.actions}>
        <Button title={t('manage.openChat')} onPress={() => router.push(`/chat/${actorId}`)} />
        <Button
          title={storePlatform ? t('manage.cancelInStore') : bundleCover ? t('bundle.cancel') : t('manage.cancel')}
          variant="danger"
          loading={cancelling}
          onPress={cancel}
        />
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
