import { useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles } from 'lucide-react-native';

import { BundleAvatars } from '@/components/bundle-card';
import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { useCancelPurchase, useMyBundles, type MyBundle } from '@/hooks/use-bundles';
import { useMySubscriptions, type Subscription } from '@/hooks/use-subscriptions';
import { ApiError } from '@/lib/api-client';
import { confirm } from '@/lib/confirm';
import { openStoreSubscriptions, storeName } from '@/lib/store-subscriptions';
import { useStorePurchase } from '@/hooks/use-store-purchase';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { formatPrice } from '@/utils/price';

/** 구독 관리 — DESIGN_GUIDE §11: 여러 배우 구독을 세로 카드 목록으로(사진·이름·월 요금·상태), 누르면 상세 */
export default function ManageSubscriptionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: subscriptions, isLoading } = useMySubscriptions();
  const { data: bundles } = useMyBundles();

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={subscriptions ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={bundles?.length ? <MyBundlesSection bundles={bundles} /> : null}
      ListFooterComponent={Platform.OS === 'web' ? null : <RestorePurchases />}
      renderItem={({ item }) => <SubscriptionCard sub={item} onPress={() => router.push({ pathname: '/subscriptions/[actorId]', params: { actorId: item.actorId } })} />}
      ListEmptyComponent={
        isLoading ? (
          <ActivityIndicator style={styles.loading} color={theme.tint} />
        ) : (
          <EmptyState
            icon={Sparkles}
            title={t('profile.noSubscriptions')}
            action={<Button title={t('inbox.discover')} onPress={() => router.push('/')} />}
          />
        )
      }
    />
  );
}

/**
 * 묶음 구독 카드(2026-09-29) — 묶음은 한 번에 해지(포함된 배우 중 따로 개인 구독한 배우는 그대로). 실제 결제가 붙으면
 * 해지는 스토어에서 하고 서버가 반영하게 바뀜(지금은 테스트 구독이라 여기서 바로).
 */
function MyBundlesSection({ bundles }: { bundles: MyBundle[] }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const cancel = useCancelPurchase();
  const [error, setError] = useState<string | null>(null);

  const startCancel = async (item: MyBundle) => {
    // 스토어 결제 묶음은 스토어에서 해지
    if (item.iapPlatform) {
      const store = storeName(item.iapPlatform);
      if (await confirm(t('manage.cancelInStore'), t('manage.cancelInStoreBody', { store }), t('manage.openStore', { store }), t('common.cancel'))) {
        void openStoreSubscriptions();
      }
      return;
    }
    const names = item.bundle.actors.map((actor) => actor.chatDisplayName).join(', ');
    const ok = await confirm(t('bundle.cancelTitle'), t('bundle.cancelConfirm', { name: item.bundle.name, names }), t('bundle.cancel'), t('common.cancel'));
    if (!ok) return;
    setError(null);
    cancel.mutate(item.purchaseId, { onError: (e) => setError(e instanceof ApiError ? e.message : t('bundle.cancelFailed')) });
  };

  return (
    <View style={styles.section}>
      <ThemedText type="headline">{t('bundle.mine')}</ThemedText>
      {bundles.map((item) => (
        <View key={item.purchaseId} style={[styles.bundleCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.bundleHead}>
            <BundleAvatars actors={item.bundle.actors} size={44} />
            <View style={styles.body}>
              <ThemedText type="headline" numberOfLines={1}>
                {item.bundle.name}
              </ThemedText>
              <ThemedText type="smallMedium">
                {formatPrice(t, item.bundle.priceCents)} {t('actorProfile.perMonth')}
              </ThemedText>
            </View>
          </View>
          <Button title={t('bundle.cancel')} variant="ghost" size="md" loading={cancel.isPending && cancel.variables === item.purchaseId} onPress={() => void startCancel(item)} />
        </View>
      ))}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      <ThemedText type="headline" style={styles.roomsTitle}>
        {t('bundle.rooms')}
      </ThemedText>
    </View>
  );
}

/**
 * 구매 복원(스토어 심사 필수 항목) — 폰을 바꾸거나 앱을 다시 깔았을 때 스토어에 남아 있는 구독을 이 계정으로 다시 연결. 다른 계정에
 * 이미 연결된 구독은 서버가 거절(영수증 공유 방지).
 */
function RestorePurchases() {
  const { t } = useTranslation();
  const store = useStorePurchase({ kind: 'actor', id: '', sku: null });
  const restore = useMutation({ mutationFn: store.restore });
  return (
    <View style={styles.restore}>
      <Button title={t('manage.restore')} variant="ghost" size="md" loading={restore.isPending} onPress={() => restore.mutate()} />
      {restore.isSuccess || restore.isError ? (
        <ThemedText type="small" themeColor={restore.isError ? 'danger' : 'textSecondary'} style={styles.center}>
          {restore.isError ? t('manage.restoreFailed') : restore.data ? t('manage.restoreDone', { count: restore.data }) : t('manage.restoreNone')}
        </ThemedText>
      ) : null}
    </View>
  );
}

function SubscriptionCard({ sub, onPress }: { sub: Subscription; onPress: () => void }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  // 묶음으로만 열린 방이면 "묶음" 표시(가격은 묶음 카드에)
  const viaBundle = sub.coveredBy.length > 0 && sub.coveredBy.every((cover) => cover.bundle);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 }]}>
      <Avatar uri={sub.actor.chatProfileImageUrl} name={sub.actor.chatDisplayName} size={56} />
      <View style={styles.body}>
        <ThemedText type="headline" numberOfLines={1}>
          {sub.actor.chatDisplayName}
        </ThemedText>
        <ThemedText type="smallMedium">
          {viaBundle
            ? t('bundle.viaShort')
            : `${formatPrice(t, sub.actor.monthlyPriceCents)} ${t('actorProfile.perMonth')}`}
        </ThemedText>
        <ThemedText type="caption" themeColor="textTertiary">
          {t('manage.since', { date: new Date(sub.startedAt).toLocaleDateString(i18n.language) })}
        </ThemedText>
      </View>
      <View style={[styles.status, { backgroundColor: theme.tintSoft }]}>
        <ThemedText type="captionBold" style={{ color: theme.tint }}>
          {t('manage.active')}
        </ThemedText>
      </View>
      <Icon as={ChevronRight} size={18} themeColor="textTertiary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg },
  body: { flex: 1, gap: 2 },
  status: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  loading: { marginTop: Spacing.six },
  section: { gap: Spacing.three },
  bundleCard: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  bundleHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  roomsTitle: { marginTop: Spacing.two },
  restore: { marginTop: Spacing.four, gap: Spacing.two },
  center: { textAlign: 'center' },
});
