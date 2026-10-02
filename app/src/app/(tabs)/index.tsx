import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, CloudOff, Plus, SearchX } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { BrandHeader } from '@/components/ui/brand-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { SearchField } from '@/components/ui/search-field';
import { SectionHeader } from '@/components/ui/section-header';
import { useActors, useAgencies, useCoupleRooms, type Actor } from '@/hooks/use-actors';
import { CoupleCard } from '@/components/couple-card';
import { useMySubscriptions } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';

// 등록 후 이 기간 안이면 "NEW"
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// 홈(여러 줄) 또는 한 종류만 모은 목록("전체 보기", 소속사 로고)
type DiscoverView = { kind: 'home' } | { kind: 'new' } | { kind: 'female' } | { kind: 'male' } | { kind: 'couple' } | { kind: 'agency'; agencyId: string; name: string };

const photoOf = (actor: Actor) => actor.officialProfileImageUrl ?? actor.chatProfileImageUrl;
const isNew = (actor: Actor) => !!actor.createdAt && Date.now() - new Date(actor.createdAt).getTime() < NEW_WINDOW_MS;

/**
 * 둘러보기(2026-10-02 개편, 사용자 결정) — 검색 · 새로 온 아티스트·CP(사진 카드, 등록 30일 이내) · 소속사별 보기(로고) ·
 * 여성 아티스트 · 남성 아티스트 · CP. 각 줄의 "전체 보기"·소속사 로고를 누르면 그 종류만 모은 목록(같은 화면, 위 ← 로 돌아옴).
 * 인기 순위·추천/인기 칩·"모든 아티스트"는 뺌. 구독 전 화면이라 이름은 전부 공식 이름. 검색은 1인·CP 모두.
 * 피드가 아니라 아티스트 찾기가 목적 — 게시물·콘텐츠 섹션은 넣지 않음.
 */
export default function DiscoverScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<DiscoverView>({ kind: 'home' });
  const searching = query.trim().length > 0;
  const home = view.kind === 'home' && !searching;

  const { data: agencies } = useAgencies();
  const newest = useActors({ kind: 'ALL', sort: 'new' });
  const female = useActors({ gender: 'FEMALE' });
  const male = useActors({ gender: 'MALE' });
  const couples = useCoupleRooms();
  const agencyList = useActors({ agencyId: view.kind === 'agency' ? view.agencyId : null, kind: 'ALL', enabled: view.kind === 'agency' });
  const search = useActors({ query: query.trim(), kind: 'ALL', enabled: searching });
  const { data: subscriptions } = useMySubscriptions();
  const subscribed = useMemo(() => new Set(subscriptions?.map((s) => s.actorId)), [subscriptions]);
  const recent = useMemo(() => (newest.data ?? []).filter(isNew), [newest.data]);

  // 지금 목록 화면에 보일 것(홈이면 빈 목록 — 줄들은 머리말에)
  const current = searching
    ? search
    : view.kind === 'female'
      ? female
      : view.kind === 'male'
        ? male
        : view.kind === 'couple'
          ? couples
          : view.kind === 'agency'
            ? agencyList
            : newest;
  const listData = home ? [] : view.kind === 'new' && !searching ? recent : (current.data ?? []);
  const listTitle =
    view.kind === 'new'
      ? t('discover.newTitle')
      : view.kind === 'female'
        ? t('discover.femaleTitle')
        : view.kind === 'male'
          ? t('discover.maleTitle')
          : view.kind === 'couple'
            ? t('discover.coupleTitle')
            : view.kind === 'agency'
              ? view.name
              : '';

  const open = (actor: Actor) => router.push(`/actor/${actor.id}`);
  const contentWidth = Math.min(width, MaxContentWidth);
  const cardWidth = (contentWidth - Spacing.four * 2 - Spacing.three) / 2;
  const refreshing = newest.isRefetching || female.isRefetching || male.isRefetching || couples.isRefetching;
  const refresh = () => {
    void newest.refetch();
    void female.refetch();
    void male.refetch();
    void couples.refetch();
    if (view.kind === 'agency') void agencyList.refetch();
    if (searching) void search.refetch();
  };

  const personRow = (rows: Actor[] | undefined, title: string, next: DiscoverView) =>
    (rows?.length ?? 0) > 0 ? (
      <View style={styles.section}>
        <SectionHeader title={title} action={t('discover.seeAll')} onAction={() => setView(next)} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ringRow}>
          {rows!.slice(0, 12).map((actor) => (
            <Pressable
              key={actor.id}
              onPress={() => open(actor)}
              style={styles.ringItem}
              accessibilityRole="button"
              accessibilityLabel={t('discover.openProfile', { name: actor.legalName })}>
              <Avatar uri={photoOf(actor)} size={68} />
              <ThemedText type="smallMedium" numberOfLines={1} style={styles.ringName}>
                {actor.legalName}
              </ThemedText>
              {actor.agency ? (
                <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1} style={styles.ringName}>
                  {actor.agency.name}
                </ThemedText>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    ) : null;

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

      {!home && !searching && (
        <View style={styles.listHead}>
          <IconButton icon={ChevronLeft} label={t('discover.back')} onPress={() => setView({ kind: 'home' })} />
          <ThemedText type="headline" numberOfLines={1} style={styles.flex}>
            {listTitle}
          </ThemedText>
        </View>
      )}
      {searching && <View style={styles.gap} />}

      {home && recent.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('discover.newTitle')} action={t('discover.seeAll')} onAction={() => setView({ kind: 'new' })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
            {recent.slice(0, 8).map((actor) => (
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

      {home && (agencies?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('discover.agenciesTitle')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ringRow}>
            {agencies!.map((agency) => (
              <Pressable
                key={agency.id}
                onPress={() => setView({ kind: 'agency', agencyId: agency.id, name: agency.name })}
                style={styles.ringItem}
                accessibilityRole="button"
                accessibilityLabel={agency.name}>
                {agency.logoUrl ? (
                  <Image source={{ uri: agency.logoUrl }} style={[styles.agencyLogo, { backgroundColor: theme.backgroundElement }]} contentFit="cover" />
                ) : (
                  <View style={[styles.agencyLogo, styles.agencyFallback, { backgroundColor: theme.tintSoft }]}>
                    <ThemedText type="headline" style={{ color: theme.tint }}>
                      {agency.name.trim().charAt(0)}
                    </ThemedText>
                  </View>
                )}
                <ThemedText type="caption" numberOfLines={1} style={styles.ringName}>
                  {agency.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {home && personRow(female.data, t('discover.femaleTitle'), { kind: 'female' })}
      {home && personRow(male.data, t('discover.maleTitle'), { kind: 'male' })}

      {/* CP(커플방, 2026-09-29) — 두 아티스트가 함께 보내는 방 */}
      {home && (couples.data?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('discover.coupleTitle')} action={t('discover.seeAll')} onAction={() => setView({ kind: 'couple' })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
            {couples.data!.map((room) => (
              <View key={room.id} style={styles.coupleItem}>
                <CoupleCard room={room} onPress={() => open(room)} />
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const homeEmpty = home && !newest.isLoading && (newest.data?.length ?? 0) === 0 && (couples.data?.length ?? 0) === 0;
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <FlatList
        data={listData}
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
          home && !homeEmpty ? null : current.isLoading ? (
            <ActivityIndicator style={styles.loading} color={theme.tint} />
          ) : current.isError ? (
            <EmptyState
              icon={CloudOff}
              title={t('discover.loadFailedTitle')}
              action={<Button title={t('discover.retry')} variant="secondary" onPress={() => void current.refetch()} />}
            />
          ) : (
            <EmptyState icon={SearchX} title={t('discover.emptyTitle')} body={searching ? t('discover.emptyBody') : undefined} />
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
        // 사진이 없으면 Cloud 바탕 위쪽에 기본 프로필 원(아래 이름 그림자에 가리지 않게)
        <View style={[StyleSheet.absoluteFill, styles.cardFallback]}>
          <Avatar size={width * 0.52} />
        </View>
      )}
      <LinearGradient colors={['transparent', 'rgba(15,17,21,0.78)']} style={styles.cardShade} />
      {/* CP는 보라 "CP", 1인은 등록 30일 이내면 흰 "NEW" — 구독 중이면 "구독 중"이 먼저 */}
      {!subscribed && (actor.kind === 'COUPLE' || isNew(actor)) && (
        <View style={[styles.tag, { backgroundColor: actor.kind === 'COUPLE' ? theme.tint : '#ffffff' }]}>
          <ThemedText type="captionBold" style={{ color: actor.kind === 'COUPLE' ? '#ffffff' : theme.tint, fontSize: 10, lineHeight: 14 }}>
            {actor.kind === 'COUPLE' ? t('discover.cpBadge') : t('discover.newBadge')}
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
  flex: { flex: 1 },
  gap: { height: Spacing.three },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  section: { marginTop: Spacing.four },
  ringRow: { gap: Spacing.three, paddingHorizontal: Spacing.four },
  ringItem: { width: 76, alignItems: 'center' },
  ringName: { marginTop: 4, maxWidth: 76, textAlign: 'center' },
  agencyLogo: { width: 64, height: 64, borderRadius: Radius.lg, overflow: 'hidden' },
  agencyFallback: { alignItems: 'center', justifyContent: 'center' },
  cardRow: { gap: Spacing.three, paddingHorizontal: Spacing.four },
  gridRow: { gap: Spacing.three, paddingHorizontal: Spacing.four, marginBottom: Spacing.three },
  card: { borderRadius: Radius.lg, overflow: 'hidden', justifyContent: 'flex-end' },
  cardFallback: { alignItems: 'center', paddingTop: '12%' },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  tag: { position: 'absolute', top: 10, left: 10, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  cardText: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: Spacing.two },
  cardTextBody: { flex: 1, gap: 1 },
  onPhoto: { color: '#ffffff' },
  onPhotoSoft: { color: 'rgba(255,255,255,0.8)' },
  plus: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: Spacing.six },
});
