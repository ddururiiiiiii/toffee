import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, ChevronLeft, Sparkle } from 'lucide-react-native';

import { MembershipBenefits } from '@/components/membership-benefits';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { ApiError } from '@/lib/api-client';
import { useActor } from '@/hooks/use-actors';
import { useSubscribe } from '@/hooks/use-subscriptions';
import { useStorePurchase } from '@/hooks/use-store-purchase';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { formatPrice } from '@/utils/price';

/**
 * 구독 확인 → 완료 — 시안 P-2 Actor-focused Subscription(docs/product/brand/exploration/p2-subscription-flow.png) +
 * DESIGN_GUIDE §6·§7. 배우 사진이 주인공, 아래 시트에 가격·혜택·자동 갱신 안내·구독 버튼. 완료는 영수증이 아니라
 * "더 가까워졌어요" 순간 → 바로 그 배우 채팅방으로.
 * 결제: 앱이고 배우에게 스토어 상품 ID가 있으면 스토어 결제(2026-09-29 코드 미리 작성, 스토어 등록 후 동작), 아니면 결제 없는 테스트
 * 구독(서버가 켜 둔 경우에만 — 개발·데모).
 */
export default function SubscribeScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { actorId } = useLocalSearchParams<{ actorId: string }>();
  const { data: actor } = useActor(actorId);
  const subscribe = useSubscribe(actorId);
  const store = useStorePurchase({ kind: 'actor', id: actorId, sku: actor?.storeProductId });
  const storeBuy = useMutation({ mutationFn: store.buy, onSuccess: (result) => result && setDone({}) });
  const busy = subscribe.isPending || storeBuy.isPending;
  const failure = storeBuy.error ?? subscribe.error;
  const [done, setDone] = useState<{ discount?: string } | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/actor/[id]', params: { id: actorId } }));

  if (!actor) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      </SafeAreaView>
    );
  }
  const photo = actor.officialProfileImageUrl ?? actor.chatProfileImageUrl;
  const price = formatPrice(t, actor.monthlyPriceCents);

  const confirm = () =>
    store.available
      ? storeBuy.mutate()
      : subscribe.mutate(undefined, {
      onSuccess: (result) =>
        setDone({
          discount: result.bundleDiscountApplied
            ? t('subscribeFlow.discount', { base: formatPrice(t, result.basePriceCents), effective: formatPrice(t, result.effectivePriceCents) })
            : undefined,
        }),
    });

  if (done) {
    return (
      <View style={[styles.flex, styles.doneWrap]}>
        {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <LinearGradient colors={['rgba(15,17,21,0.15)', 'rgba(15,17,21,0.55)', 'rgba(15,17,21,0.92)']} style={StyleSheet.absoluteFill} />
        <View style={[styles.doneBody, { paddingBottom: insets.bottom + Spacing.five }]}>
          <Icon as={Sparkle} size={28} color={theme.tint} fill={theme.tint} />
          <ThemedText type="display" style={styles.onDark}>
            {t('subscribeFlow.doneTitle')}
          </ThemedText>
          <ThemedText style={styles.onDarkSoft}>{t('subscribeFlow.doneBody', { name: actor.chatDisplayName })}</ThemedText>
          {done.discount ? (
            <ThemedText type="small" style={styles.onDarkSoft}>
              {done.discount}
            </ThemedText>
          ) : null}
          <Button
            title={t('subscribeFlow.start')}
            variant="accent"
            iconRight={ArrowRight}
            style={styles.doneCta}
            onPress={() => router.replace(`/chat/${actorId}`)}
          />
          <Pressable onPress={() => router.replace({ pathname: '/actor/[id]', params: { id: actorId } })} hitSlop={8} accessibilityRole="link">
            <ThemedText type="smallMedium" style={[styles.onDarkSoft, styles.underline]}>
              {t('subscribeFlow.goProfile', { name: actor.chatDisplayName })}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={[styles.hero, { height: Math.min(Math.max(height * 0.42, 280), 440) }]}>
          {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
        </View>
        <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.four }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('subscribeFlow.subscribeTo')}
          </ThemedText>
          <ThemedText type="display">{actor.legalName}</ThemedText>
          <View style={styles.price}>
            <ThemedText type="title">{price}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {' '}
              {t('actorProfile.perMonth')}
            </ThemedText>
          </View>

          <View style={styles.benefits}>
            <MembershipBenefits name={actor.legalName} detailed />
          </View>

          {failure && (
            <ThemedText type="small" themeColor="danger" style={styles.center}>
              {failure instanceof ApiError ? failure.message : t('subscribeFlow.failed')}
            </ThemedText>
          )}
          <Button title={t('subscribeFlow.cta', { price })} variant="accent" loading={busy} onPress={confirm} />
          <ThemedText type="caption" themeColor="textTertiary" style={styles.center}>
            {t('subscribeFlow.autoRenew')}
          </ThemedText>
          {store.available ? null : (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.center}>
              {t('subscribeFlow.sandboxNote')}
            </ThemedText>
          )}
        </View>
      </ScrollView>
      <IconButton
        icon={ChevronLeft}
        label={t('actorProfile.back')}
        onPress={back}
        color="#ffffff"
        style={[styles.back, { top: insets.top + Spacing.two }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  hero: { width: '100%', overflow: 'hidden' },
  sheet: {
    marginTop: -Radius.xl,
    borderTopLeftRadius: Radius.xl + 4,
    borderTopRightRadius: Radius.xl + 4,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  price: { flexDirection: 'row', alignItems: 'baseline' },
  benefits: { marginVertical: Spacing.three },
  center: { textAlign: 'center' },
  back: { position: 'absolute', left: Spacing.three, backgroundColor: 'rgba(15,17,21,0.35)' },
  loading: { marginTop: Spacing.six },
  doneWrap: { backgroundColor: '#0F1115', justifyContent: 'flex-end' },
  doneBody: { paddingHorizontal: Spacing.four, gap: Spacing.two, alignItems: 'center', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  onDark: { color: '#ffffff', textAlign: 'center' },
  onDarkSoft: { color: 'rgba(255,255,255,0.82)', textAlign: 'center' },
  doneCta: { alignSelf: 'stretch', marginTop: Spacing.four, marginBottom: Spacing.two },
  underline: { textDecorationLine: 'underline' },
});
