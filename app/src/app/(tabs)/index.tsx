import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { CloudOff, Plus, SearchX } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { BrandHeader } from '@/components/ui/brand-header';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { SearchField } from '@/components/ui/search-field';
import { SectionHeader } from '@/components/ui/section-header';
import { useActors, useAgencies, useCoupleRooms, type Actor, type ActorSort } from '@/hooks/use-actors';
import { CoupleCard } from '@/components/couple-card';
import { useMySubscriptions } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';

// 등록 후 이 기간 안이면 "NEW"
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
type Filter = 'forYou' | ActorSort | { agencyId: string };

const photoOf = (actor: Actor) => actor.officialProfileImageUrl ?? actor.chatProfileImageUrl;
const isNew = (actor: Actor) => !!actor.createdAt && Date.now() - new Date(actor.createdAt).getTime() < NEW_WINDOW_MS;

/**
 * Discover — 시안 03 Fandom Discovery(docs/product/brand/exploration/03-fandom-discovery.png) + DESIGN_GUIDE §4.
 * 검색 · 추천/인기/신규 칩(+소속사) · "지금 인기 있는 배우"(순위 링) · "새로 온 배우"(사진 카드) · 모든 배우.
 * 피드가 아니라 배우 찾기가 목적 — 게시물·콘텐츠 섹션은 넣지 않음.
 */
export default function DiscoverScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('forYou');
  const agencyId = typeof filter === 'object' ? filter.agencyId : null;
  const sort = filter === 'trending' || filter === 'new' ? filter : undefined;
  const showSections = filter === 'forYou' && !query;

  const { data: agencies } = useAgencies();
  const list = useActors(query, agencyId, sort);
  const trending = useActors('', null, 'trending');
  const newest = useActors('', null, 'new');
  const couples = useCoupleRooms();
  const { data: subscriptions } = useMySubscriptions();
  const subscribed = useMemo(() => new Set(subscriptions?.map((s) => s.actorId)), [subscriptions]);

  const open = (actor: Actor) => router.push(`/actor/${actor.id}`);
  const contentWidth = Math.min(width, MaxContentWidth);
  const cardWidth = (contentWidth - Spacing.four * 2 - Spacing.three) / 2;
  const refreshing = list.isRefetching || trending.isRefetching || newest.isRefetching;
  const refresh = () => {
    void list.refetch();
    void trending.refetch();
    void newest.refetch();
    void couples.refetch();
  };

  const header = (
    <View>
      <BrandHeader tagline={t('discover.tagline')} />
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t('discover.searchPlaceholder')}
        clearLabel={t('discover.clearSearch')}
        style={styles.search}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={t('discover.forYou')} selected={filter === 'forYou'} onPress={() => setFilter('forYou')} />
        <Chip label={t('discover.trending')} selected={filter === 'trending'} onPress={() => setFilter('trending')} />
        <Chip label={t('discover.new')} selected={filter === 'new'} onPress={() => setFilter('new')} />
        {agencies?.map((agency) => (
          <Chip
            key={agency.id}
            label={agency.name}
            selected={agencyId === agency.id}
            onPress={() => setFilter(agencyId === agency.id ? 'forYou' : { agencyId: agency.id })}
          />
        ))}
      </ScrollView>

      {showSections && (trending.data?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('discover.trendingTitle')} action={t('discover.seeAll')} onAction={() => setFilter('trending')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ringRow}>
            {trending.data!.slice(0, 10).map((actor, index) => (
              <Pressable
                key={actor.id}
                onPress={() => open(actor)}
                style={styles.ringItem}
                accessibilityRole="button"
                accessibilityLabel={t('discover.openProfile', { name: actor.legalName })}>
                <Avatar uri={photoOf(actor)} name={actor.legalName} size={68} ring />
                <View style={[styles.rank, { backgroundColor: theme.background, borderColor: theme.tintSoft }]}>
                  <ThemedText type="captionBold" style={{ color: theme.tint }}>
                    {index + 1}
                  </ThemedText>
                </View>
                <ThemedText type="smallMedium" numberOfLines={1} style={styles.ringName}>
                  {actor.legalName}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {showSections && (newest.data?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('discover.newTitle')} action={t('discover.seeAll')} onAction={() => setFilter('new')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
            {newest.data!.slice(0, 6).map((actor) => (
              <ActorPhotoCard
                key={actor.id}
                actor={actor}
                width={Math.min(cardWidth, 200)}
                subscribed={subscribed.has(actor.id)}
                onPress={() => open(actor)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* 커플방(2026-09-29) — 두 배우가 함께 보내는 방 */}
      {showSections && (couples.data?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('couple.discoverTitle')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
            {couples.data!.map((room) => (
              <View key={room.id} style={styles.coupleItem}>
                <CoupleCard room={room} onPress={() => open(room)} />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {showSections && <SectionHeader title={t('discover.allTitle')} />}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        key="grid"
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.content, { maxWidth: MaxContentWidth }]}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />}
        renderItem={({ item }) => (
          <ActorPhotoCard actor={item} width={cardWidth} subscribed={subscribed.has(item.id)} onPress={() => open(item)} />
        )}
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator style={styles.loading} color={theme.tint} />
          ) : list.isError ? (
            <EmptyState
              icon={CloudOff}
              title={t('discover.loadFailedTitle')}
              action={<Button title={t('discover.retry')} variant="secondary" onPress={() => void list.refetch()} />}
            />
          ) : (
            <EmptyState icon={SearchX} title={t('discover.emptyTitle')} body={t('discover.emptyBody')} />
          )
        }
      />
    </SafeAreaView>
  );
}

/** 사진 카드 — 아래쪽 어둡게 깔고 이름·소속사·가격, 오른쪽 아래 + (프로필로) */
function ActorPhotoCard({ actor, width, subscribed, onPress }: { actor: Actor; width: number; subscribed: boolean; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const photo = photoOf(actor);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('discover.openProfile', { name: actor.legalName })}
      style={({ pressed }) => [styles.card, { width, height: width * 1.25, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.9 : 1 }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cardFallback, { backgroundColor: theme.tintSoft }]}>
          <ThemedText type="display" style={{ color: theme.tint }}>
            {actor.legalName.charAt(0)}
          </ThemedText>
        </View>
      )}
      <LinearGradient colors={['transparent', 'rgba(15,17,21,0.78)']} style={styles.cardShade} />
      {isNew(actor) && !subscribed && (
        <View style={[styles.tag, { backgroundColor: '#ffffff' }]}>
          <ThemedText type="captionBold" style={{ color: theme.tint, fontSize: 10, lineHeight: 14 }}>
            {t('discover.newBadge')}
          </ThemedText>
        </View>
      )}
      {subscribed && (
        <View style={[styles.tag, { backgroundColor: theme.tint }]}>
          <ThemedText type="captionBold" style={{ color: '#ffffff', fontSize: 10, lineHeight: 14 }}>
            {t('discover.subscribed')}
          </ThemedText>
        </View>
      )}
      <View style={styles.cardText}>
        <View style={styles.cardTextBody}>
          <ThemedText type="headline" numberOfLines={1} style={styles.onPhoto}>
            {actor.legalName}
          </ThemedText>
          <ThemedText type="caption" numberOfLines={1} style={styles.onPhotoSoft}>
            {[actor.agency?.name, t('price.perMonth', { price: (actor.monthlyPriceCents / 100).toFixed(0) })].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        {!subscribed && (
          <View style={styles.plus}>
            <Icon as={Plus} size={18} color={theme.tint} strokeWidth={2.25} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  coupleItem: { width: 300 },
  container: { flex: 1 },
  content: { paddingBottom: Spacing.five, width: '100%', alignSelf: 'center' },
  search: { marginHorizontal: Spacing.four },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  section: { marginTop: Spacing.two, marginBottom: Spacing.four },
  ringRow: { gap: Spacing.three, paddingHorizontal: Spacing.four },
  ringItem: { width: 72, alignItems: 'center' },
  rank: {
    marginTop: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringName: { marginTop: 4, maxWidth: 72, textAlign: 'center' },
  cardRow: { gap: Spacing.three, paddingHorizontal: Spacing.four },
  gridRow: { gap: Spacing.three, paddingHorizontal: Spacing.four, marginBottom: Spacing.three },
  card: { borderRadius: Radius.lg, overflow: 'hidden', justifyContent: 'flex-end' },
  cardFallback: { alignItems: 'center', justifyContent: 'center' },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  tag: { position: 'absolute', top: 10, left: 10, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  cardText: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: Spacing.two },
  cardTextBody: { flex: 1, gap: 1 },
  onPhoto: { color: '#ffffff' },
  onPhotoSoft: { color: 'rgba(255,255,255,0.8)' },
  plus: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: Spacing.six },
});
