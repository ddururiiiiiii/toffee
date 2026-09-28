import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, ChevronLeft, SearchX } from 'lucide-react-native';

import { MembershipBenefits } from '@/components/membership-benefits';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { useActor } from '@/hooks/use-actors';
import { useMySubscriptions } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { formatPrice } from '@/utils/price';

/**
 * 배우 프로필 — Hybrid 시안(docs/product/brand/exploration/hybrid-recommendation-profile.png)의 분위기 + DESIGN_GUIDE §5의
 * 최종 결정: 배우 정보(큰 사진·이름·소속사) + 구독 정보(월 요금·혜택 아이콘 목록·"구독하고 메시지 받기")만.
 * 게시물·최근 콘텐츠 같은 피드 섹션은 넣지 않음. 무료 이용이 없다는 것도 숨기지 않고 적음.
 */
export default function ActorProfileScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: actor, isLoading, isError } = useActor(id);
  const { data: subscriptions } = useMySubscriptions();
  const isSubscribed = subscriptions?.some((sub) => sub.actorId === id) ?? false;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      </SafeAreaView>
    );
  }
  if (isError || !actor) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <IconButton icon={ChevronLeft} label={t('actorProfile.back')} onPress={back} style={styles.backPlain} />
        <EmptyState icon={SearchX} title={t('actorProfile.notFound')} />
      </SafeAreaView>
    );
  }

  const photo = actor.officialProfileImageUrl ?? actor.chatProfileImageUrl;
  const heroHeight = Math.min(Math.max(height * 0.5, 320), 520);
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.five }]} bounces={false}>
        <View style={[styles.hero, { height: heroHeight, maxWidth: MaxContentWidth, width: Math.min(width, MaxContentWidth) }]}>
          {photo ? (
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.tintSoft }]} />
          )}
          {/* 사진 아래쪽을 배경색으로 자연스럽게 이어줌 */}
          <LinearGradient colors={['transparent', theme.background]} style={styles.heroFade} />
        </View>

        <View style={styles.body}>
          <ThemedText type="display">{actor.legalName}</ThemedText>
          {actor.agency ? (
            <ThemedText type="small" themeColor="textSecondary">
              {actor.agency.name}
            </ThemedText>
          ) : null}

          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.cardHead}>
              <ThemedText type="headline">{t('actorProfile.membership')}</ThemedText>
              <View style={styles.price}>
                <ThemedText type="title" style={{ color: theme.tint }}>
                  {formatPrice(t, actor.monthlyPriceCents)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {' '}
                  {t('actorProfile.perMonth')}
                </ThemedText>
              </View>
            </View>
            <MembershipBenefits name={actor.chatDisplayName} />
            {isSubscribed ? (
              <Button title={t('actorProfile.openChat')} iconRight={ArrowRight} onPress={() => router.push(`/chat/${id}`)} />
            ) : (
              <Button
                title={t('actorProfile.subscribeCta')}
                iconRight={ArrowRight}
                onPress={() => router.push({ pathname: '/subscribe/[actorId]', params: { actorId: id } })}
              />
            )}
            <ThemedText type="caption" themeColor="textTertiary" style={styles.center}>
              {isSubscribed ? t('actorProfile.subscribed') : t('actorProfile.noFreeTier')}
            </ThemedText>
          </View>
        </View>
      </ScrollView>
      {/* 사진 위에 떠 있는 뒤로 버튼 */}
      <IconButton
        icon={ChevronLeft}
        label={t('actorProfile.back')}
        onPress={back}
        color="#ffffff"
        style={[styles.backFloating, { top: insets.top + Spacing.two }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { alignItems: 'center' },
  hero: { alignSelf: 'center', overflow: 'hidden' },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '35%' },
  body: { width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.four, marginTop: -Spacing.five, gap: 2 },
  card: { marginTop: Spacing.four, borderRadius: Radius.xl, padding: Spacing.four, gap: Spacing.four },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two, flexWrap: 'wrap' },
  price: { flexDirection: 'row', alignItems: 'baseline' },
  center: { textAlign: 'center', marginTop: -Spacing.two },
  backFloating: { position: 'absolute', left: Spacing.three, backgroundColor: 'rgba(15,17,21,0.35)' },
  backPlain: { margin: Spacing.three },
  loading: { marginTop: Spacing.six },
});
