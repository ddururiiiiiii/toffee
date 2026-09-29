import { ActivityIndicator, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Images } from 'lucide-react-native';

import { MediaTile } from '@/components/media-tile';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui/empty-state';
import { useChatMedia } from '@/hooks/use-messages';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';

const COLUMNS = 3;
const GAP = 2;

/**
 * 채팅방 "사진·영상 모아보기"(카톡 서랍처럼, 2026-09-29) — 스타가 보낸 사진·영상을 최신순 격자로. 누르면 전체 화면에서
 * 좌우로 넘겨 봄. 대화를 50개씩 나눠 불러와서 채팅방 스크롤로는 오래된 사진을 찾기 어려웠던 문제.
 */
export default function MediaGalleryScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { actorId } = useLocalSearchParams<{ actorId: string }>();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useChatMedia(actorId);
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const tile = Math.floor((Math.min(width, MaxContentWidth) - GAP * (COLUMNS - 1)) / COLUMNS);

  if (isLoading) return <ActivityIndicator style={styles.loading} color={theme.tint} />;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={COLUMNS}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={
        total > 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
            {t('gallery.count', { count: total })}
          </ThemedText>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={{ width: tile, height: tile }}>
          <MediaTile
            id={item.id}
            url={item.mediaUrl}
            mediaType={item.mediaType}
            durationMs={item.mediaDurationMs}
            thumbnailUrl={item.thumbnailUrl}
            thumbhash={item.thumbhash}
            actorId={actorId}
            size={{ width: tile, height: tile }}
          />
        </View>
      )}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={theme.tint} style={styles.more} /> : null}
      ListEmptyComponent={<EmptyState icon={Images} title={t('gallery.empty')} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: GAP, paddingBottom: Spacing.five },
  row: { gap: GAP },
  count: { padding: Spacing.three },
  loading: { marginTop: Spacing.six },
  more: { marginVertical: Spacing.three },
});
