import { TranslatableText } from '@/components/translatable-text';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FanReplyActions } from '@/components/fan-reply-actions';
import type { FanReply } from '@/hooks/use-console';
import { useMessageReplies, useStudioMessages } from '@/hooks/use-studio';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { showNameToken } from '@/utils/name-token';

// 맨 아래(최신)에서 이만큼 안쪽이면 "맨 아래를 보고 있음" — 새 답장이 오면 따라 내려감
const AT_BOTTOM_PX = 80;

/**
 * 스타 메시지 하나에 달린 팬 답장 — 카톡 채팅방처럼: 위에 스타 메시지 고정, 팬 답장은 말풍선으로 오래된 게 위·새 답장이
 * 맨 아래(버블·위버스 방식, 2026-09-28 사용자 결정). 화면은 맨 아래에서 시작하고, 맨 아래를 보고 있으면 새 답장을 따라
 * 올라가며, 위로 올려 예전 답장을 읽는 중이면 끌어내리지 않고 "새 답장 N개 ↓" 버튼만 띄움. 위 끝까지 올리면 이전
 * 답장을 더 불러옴. 신고·차단·답장하기(인용)는 말풍선 옆 ⋯ 메뉴.
 * 팬 답장은 서버가 "보낸 시점의 최신 스타 메시지"로 자동으로 묶어둠.
 */
export default function MessageRepliesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { actorId, messageId } = useLocalSearchParams<{ actorId: string; messageId: string }>();
  const { data: messages } = useStudioMessages(actorId);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessageReplies(actorId, messageId);
  const original = messages?.find((message) => message.id === messageId);

  // 최신 → 오래된 순(서버 순서 그대로) — 뒤집힌(inverted) 목록이라 첫 항목이 맨 아래에 그려짐
  const replies = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages.flat() ?? []).filter((reply) => !seen.has(reply.id) && seen.add(reply.id));
  }, [data]);

  const listRef = useRef<FlatList<FanReply>>(null);
  const [atBottom, setAtBottom] = useState(true);
  // 위로 올려 둔 동안 새로 온 답장 수 — 맨 아래에서 마지막으로 본 최신 답장 id 기준
  const [seenNewestId, setSeenNewestId] = useState<string | undefined>(undefined);
  const newestId = replies[0]?.id;
  const markedNewest = seenNewestId ?? newestId;
  const unseen = atBottom || !markedNewest ? 0 : Math.max(replies.findIndex((r) => r.id === markedNewest), 0);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const bottom = event.nativeEvent.contentOffset.y < AT_BOTTOM_PX;
    if (bottom !== atBottom) setAtBottom(bottom);
    // 위로 올리는 순간의 최신 답장을 기억(그 뒤에 온 것만 "새 답장"), 맨 아래로 오면 초기화
    if (!bottom && atBottom) setSeenNewestId(newestId);
    if (bottom && seenNewestId) setSeenNewestId(undefined);
  };

  const quote = (item: FanReply) =>
    // 새 화면을 쌓지 않고 아래에 있던 스튜디오 화면으로 돌아가면서 인용 정보를 넘김
    router.dismissTo({
      pathname: '/studio/[actorId]',
      params: {
        actorId,
        quoteId: item.id,
        quoteNickname: item.fanUser?.nickname ?? '',
        quoteBody: (item.body ?? '').slice(0, 120),
      },
    });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {original && (
        <ThemedView type="tintSoft" style={styles.original}>
          {original.mediaType !== 'TEXT' && (
            <ThemedText type="smallBold">{t(`studio.media.${original.mediaType}`)}</ThemedText>
          )}
          {original.body && (
            <ThemedText type="small" numberOfLines={3}>
              {showNameToken(original.body, t('studio.fanNickname'))}
            </ThemedText>
          )}
          <Pressable onPress={() => router.push(`/blocks/${actorId}`)} hitSlop={8} style={styles.blocksLink}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('block.manage')} ›
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}
      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : (
        <ThemedView style={styles.listArea}>
          <FlatList
            ref={listRef}
            inverted
            data={replies}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onScroll={onScroll}
            scrollEventThrottle={100}
            // 맨 아래 근처면 새 답장을 따라 내려가고, 위로 올려 읽는 중이면 보던 자리를 유지
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: AT_BOTTOM_PX }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={theme.tint} /> : null}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {t('studio.repliesEmpty')}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <ReplyBubble item={item} locale={i18n.language} actorId={actorId} onQuote={() => quote(item)} />
            )}
          />
          {unseen > 0 && (
            <Pressable
              onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
              style={[styles.newPill, { backgroundColor: theme.tint }]}
              accessibilityRole="button">
              <ThemedText type="smallBold" style={styles.newPillText}>
                {t('studio.newReplies', { count: unseen })}
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>
      )}
    </SafeAreaView>
  );
}

function ReplyBubble({ item, locale, actorId, onQuote }: { item: FanReply; locale: string; actorId: string; onQuote: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.row}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {item.fanUser ? `${item.fanUser.nickname ?? t('console.noNickname')} ${item.fanUser.tag}` : t('console.deletedFan')}
      </ThemedText>
      <ThemedView style={styles.bubbleLine}>
        <ThemedView style={[styles.bubble, { backgroundColor: theme.backgroundElement }]}>
          {/* 태국·일본 팬 답장 등 다른 언어면 "번역 보기" */}
          {item.body ? <TranslatableText actorId={actorId} messageId={item.id} text={item.body} /> : null}
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
          {new Date(item.createdAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </ThemedText>
        {/* 시간 옆 ⋯ — 펼치면 답장하기·신고·차단(좁으면 다음 줄로) */}
        {item.fanUser && (
          <FanReplyActions
            actorId={actorId}
            messageId={item.id}
            fanUserId={item.fanUser.id}
            nickname={item.fanUser.nickname ?? ''}
            onQuote={onQuote}
          />
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  original: { margin: Spacing.three, marginBottom: 0, borderRadius: 14, padding: Spacing.three, gap: 4 },
  loading: { marginTop: Spacing.six },
  listArea: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.three },
  empty: { textAlign: 'center', marginTop: Spacing.four },
  blocksLink: { alignSelf: 'flex-end' },
  row: { gap: 4, alignItems: 'flex-start', backgroundColor: 'transparent' },
  bubbleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: Spacing.two, rowGap: Spacing.one, backgroundColor: 'transparent' },
  bubble: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, flexShrink: 1, maxWidth: '75%' },
  time: { flexShrink: 0 },
  newPill: {
    position: 'absolute',
    bottom: Spacing.three,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  newPillText: { color: '#fff' },
});
