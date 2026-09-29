import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Download, Play, X } from 'lucide-react-native';

import { IconButton } from '@/components/ui/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ZoomablePage } from '@/components/zoomable-page';
import { useChatMedia, type ChatMediaItem } from '@/hooks/use-messages';
import { SavePermissionError, saveMedia } from '@/lib/save-media';
import { Spacing } from '@/constants/theme';

// 누른 사진이 첫 60개 안에 없으면 이만큼까지 이전 목록을 더 불러와서 찾음
const MAX_PAGES_TO_FIND = 20;

function VideoContent({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useVideoPlayer(url);
  // 열자마자 재생 — 만들 때 바로 play()하면 웹에선 영상 요소가 준비되기 전이라 무시돼서, 준비 완료 이벤트에서 한 번만
  useEffect(() => {
    let started = false;
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && !started) {
        started = true;
        player.play();
      }
    });
    return () => subscription.remove();
  }, [player]);
  return <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls />;
}

/**
 * 사진 크게 보기 / 영상 재생 전체 화면(카톡처럼 검은 배경) — 2026-09-29 카톡 수준으로:
 * - 두 손가락·두 번 탭으로 확대, 확대 중 끌어서 이동, 위아래로 끌어 닫기(ZoomablePage)
 * - 팬 채팅방에서 열면(actorId) 그 방의 스타 사진·영상을 좌우로 넘겨 봄(왼쪽이 이전, 오른쪽이 최신), 위에 날짜·"3 / 12"
 * - 저장 버튼은 지금 보고 있는 것
 * 스튜디오·콘솔처럼 actorId 없이 열면 그 한 장만. url은 서버가 준 임시 서명 URL.
 */
export default function MediaViewerScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; url: string; type: 'PHOTO' | 'VIDEO'; actorId?: string; thumbhash?: string }>();
  const media = useChatMedia(params.actorId);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const dismissProgress = useSharedValue(0);
  const listRef = useRef<FlatList<ChatMediaItem>>(null);
  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), [router]);

  // 최신 → 오래된 순. 목록에 없으면(스튜디오·콘솔, 또는 못 찾음) 누른 것 하나만
  const single: ChatMediaItem = useMemo(
    () => ({ id: params.id, mediaType: params.type, mediaUrl: params.url, thumbhash: params.thumbhash ?? null, createdAt: '' }),
    [params.id, params.type, params.url, params.thumbhash],
  );
  const loaded = useMemo(() => media.data?.pages.flatMap((page) => page.items) ?? [], [media.data]);
  const total = media.data?.pages[0]?.total ?? 0;
  const foundIndex = loaded.findIndex((item) => item.id === params.id);
  const searching = !!params.actorId && foundIndex < 0 && (media.isLoading || (media.hasNextPage && (media.data?.pages.length ?? 0) < MAX_PAGES_TO_FIND));
  const items = params.actorId && foundIndex >= 0 ? loaded : [single];
  const [index, setIndex] = useState(0);
  const current = items[index] ?? items[0];

  // 누른 게 아직 안 불러와졌으면 이전 목록을 더 불러와서 찾음
  useEffect(() => {
    if (searching && !media.isFetching && media.hasNextPage) void media.fetchNextPage();
  }, [searching, media]);
  // 찾으면 그 위치에서 시작
  const startedAt = useRef<string | null>(null);
  useEffect(() => {
    if (foundIndex >= 0 && startedAt.current !== params.id) {
      startedAt.current = params.id;
      setIndex(foundIndex);
    }
  }, [foundIndex, params.id]);

  // FlatList는 onViewableItemsChanged가 바뀌면 오류를 내서 처음 만든 함수를 계속 씀(setIndex는 안 바뀜)
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ViewToken<ChatMediaItem>[] }) => {
    const first = viewableItems[0];
    if (first?.index !== null && first?.index !== undefined) setIndex(first.index);
  });

  const go = (next: number) => {
    if (next < 0 || next >= items.length) return;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  };

  const save = async () => {
    if (!current?.mediaUrl) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await saveMedia({ id: current.id, url: current.mediaUrl, mediaType: current.mediaType });
      if (result !== 'cancelled') setNotice(t('media.saved'));
    } catch (error) {
      setNotice(error instanceof SavePermissionError ? t('media.permissionDenied') : t('media.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const backdrop = useAnimatedStyle(() => ({ opacity: interpolate(dismissProgress.value, [0, 1], [1, 0.2]) }));
  const pageHeight = height - insets.top - insets.bottom;
  const date = current?.createdAt
    ? new Date(current.createdAt).toLocaleString(i18n.language, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  // 최신이 오른쪽 끝이라 "몇 번째"는 오래된 것부터 셈
  const position = params.actorId && foundIndex >= 0 && total > 0 ? `${total - index} / ${total}` : '';

  return (
    <View style={styles.container}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.black, backdrop]} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <IconButton icon={X} label={t('media.close')} color="#ffffff" onPress={close} style={styles.topButton} />
          <View style={styles.titleBox}>
            {date ? <ThemedText type="smallMedium" style={styles.title}>{date}</ThemedText> : null}
            {position ? <ThemedText type="caption" style={styles.subtitle}>{position}</ThemedText> : null}
          </View>
          {saving ? (
            <ActivityIndicator color="#fff" style={styles.topButton} />
          ) : (
            <IconButton icon={Download} label={t('media.save')} color="#ffffff" onPress={save} style={styles.topButton} />
          )}
        </View>
        {searching ? (
          <ActivityIndicator color="#fff" style={styles.flex} />
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            inverted
            pagingEnabled
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.max(foundIndex, 0)}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            onEndReached={() => {
              if (params.actorId && media.hasNextPage && !media.isFetchingNextPage) void media.fetchNextPage();
            }}
            onEndReachedThreshold={2}
            windowSize={3}
            renderItem={({ item, index: i }) => (
              <ZoomablePage
                width={width}
                height={pageHeight - 64}
                zoomEnabled={item.mediaType === 'PHOTO'}
                dismissProgress={dismissProgress}
                onZoomChange={setZoomed}
                onDismiss={close}>
                {item.mediaType === 'VIDEO' && item.mediaUrl ? (
                  // 지금 보고 있는 영상만 플레이어를 만듦(넘길 때 옆 영상이 같이 재생되지 않게)
                  i === index ? (
                    <VideoContent url={item.mediaUrl} width={width} height={pageHeight - 64} />
                  ) : (
                    <View style={styles.videoCover}>
                      {item.thumbnailUrl ? <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
                      <Play size={40} color="#ffffff" fill="#ffffff" />
                    </View>
                  )
                ) : (
                  // 웹 브라우저의 이미지 끌기(드래그 앤 드롭)가 끌어서 닫기를 가로채지 않게 — 제스처는 바깥 페이지가 받음
                  <View pointerEvents="none">
                    <Image
                      source={{ uri: item.mediaUrl ?? undefined }}
                      placeholder={item.thumbhash ? { thumbhash: item.thumbhash } : undefined}
                      style={{ width, height: pageHeight - 64 }}
                      contentFit="contain"
                      transition={150}
                    />
                  </View>
                )}
              </ZoomablePage>
            )}
          />
        )}
        {/* PC 웹은 스와이프가 불편해서 좌우 버튼(왼쪽 = 이전, 오른쪽 = 최신) */}
        {Platform.OS === 'web' && items.length > 1 ? (
          <>
            <IconButton icon={ChevronLeft} label={t('media.previous')} color="#ffffff" onPress={() => go(index + 1)} style={[styles.arrow, styles.arrowLeft]} />
            <IconButton icon={ChevronRight} label={t('media.next')} color="#ffffff" onPress={() => go(index - 1)} style={[styles.arrow, styles.arrowRight]} />
          </>
        ) : null}
        {notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  black: { backgroundColor: '#000' },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, height: 64 },
  topButton: { backgroundColor: 'rgba(255,255,255,0.12)' },
  titleBox: { flex: 1, alignItems: 'center' },
  title: { color: '#fff' },
  subtitle: { color: 'rgba(255,255,255,0.7)' },
  videoCover: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  arrow: { position: 'absolute', top: '50%', backgroundColor: 'rgba(255,255,255,0.12)' },
  arrowLeft: { left: Spacing.three },
  arrowRight: { right: Spacing.three },
  notice: { color: '#fff', textAlign: 'center', padding: Spacing.three },
});
