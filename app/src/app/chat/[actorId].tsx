import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { type LucideIcon, ArrowUp, Bell, BellOff, ChevronDown, ChevronUp, CloudOff, Copy, CreditCard, Ellipsis, Flag, Images, Lock, MessageCircleHeart, Search, X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { MediaTile } from '@/components/media-tile';
import { QuoteBlock } from '@/components/quote-block';
import { TranslatableText } from '@/components/translatable-text';
import { VoiceMessage } from '@/components/voice-message';
import { ApiError } from '@/lib/api-client';
import { saveMedia } from '@/lib/save-media';
import { useActor } from '@/hooks/use-actors';
import { useActorMessages, useChatSearch, useReplyQuota, useSendReply, type ChatMessage } from '@/hooks/use-messages';
import { useMySubscriptions, useSetNotificationsMuted } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { fontFor, MaxContentWidth, Radius, Spacing } from '@/constants/theme';

// 맨 아래(최신)에서 이만큼 안쪽이면 "맨 아래를 보고 있음" — 새 메시지를 따라감
const AT_BOTTOM_PX = 80;
// 알림·검색 결과로 이동할 메시지가 아직 안 불러온 예전 메시지면 이만큼(50개씩)까지만 더 불러옴 — 너무 오래된 건 안내만
const MAX_FOCUS_PAGES = 20;

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
// 카톡처럼 같은 사람이 같은 시:분에 이어 보낸 메시지가 한 묶음 — 프로필 사진·이름은 묶음 첫 메시지 위, 시간은 마지막 메시지에 한 번
const sameMinute = (a: string, b: string) => Math.floor(new Date(a).getTime() / 60_000) === Math.floor(new Date(b).getTime() / 60_000);

/**
 * 팬 채팅방 — 시안 2A Minimal Premium(docs/product/brand/exploration/2a-chat-minimal-premium.png) + DESIGN_GUIDE §9.
 * 실제 1:1 DM처럼 조용하고 여백 있게: 스타는 왼쪽 Cloud 말풍선(묶음 첫 메시지 위에 프로필 사진·이름), 팬은 오른쪽 Periwinkle.
 * 헤더 이름이나 프로필 사진을 누르면 대화방 프로필 카드(chat-profile), 헤더 ⋯에 모아보기·알림·구독 관리.
 * 팬은 글·이모지만(사진·음성·영상 없음). 말풍선을 길게 누르면 복사(글이 있을 때)·신고(스타 메시지) 메뉴(말풍선마다 버튼을 늘어놓지 않음).
 * 목록은 최신이 맨 아래인 뒤집힌 목록 — 맨 아래를 보고 있으면 새 메시지를 따라가고, 위로 올려 읽는 중이면 끌어내리지
 * 않고 "새 메시지 N개 ↓"만(예전엔 사진 로딩·폴링 때마다 맨 아래로 끌려 내려갔음). 위 끝까지 올리면 이전 대화를 더 불러옴.
 */
export default function ChatRoomScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();
  // focus: 푸시 알림을 눌러 들어왔을 때 보여줄 메시지 id(없거나 목록에 없으면 평소처럼 맨 아래)
  const { actorId, focus } = useLocalSearchParams<{ actorId: string; focus?: string }>();
  const { data: actor } = useActor(actorId);
  const isCouple = actor?.kind === 'COUPLE';
  const { data: subscriptions } = useMySubscriptions();
  const subscription = subscriptions?.find((s) => s.actorId === actorId);
  const setMuted = useSetNotificationsMuted(actorId);
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useActorMessages(actorId);
  const notSubscribed = error instanceof ApiError && error.status === 403;
  const sendReply = useSendReply(actorId);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const openProfile = useCallback(
    (memberId?: string) => router.push({ pathname: '/chat-profile/[actorId]', params: { actorId, ...(memberId ? { memberId } : {}) } }),
    [router, actorId],
  );

  // 최신 → 오래된 순(서버 순서) — 뒤집힌 목록이라 첫 항목이 맨 아래
  const messages = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages.flat() ?? []).filter((m) => !seen.has(m.id) && seen.add(m.id));
  }, [data]);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [seenNewestId, setSeenNewestId] = useState<string | undefined>(undefined);
  const newestId = messages[0]?.id;
  const unseen = atBottom || !seenNewestId ? 0 : Math.max(messages.findIndex((m) => m.id === seenNewestId), 0);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const bottom = event.nativeEvent.contentOffset.y < AT_BOTTOM_PX;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (!bottom && atBottom) setSeenNewestId(newestId);
    if (bottom && seenNewestId) setSeenNewestId(undefined);
  };

  // 채팅방 안 검색(2026-09-29, 카톡처럼 방 안에서) — 위/아래 화살표로 결과(최신 → 오래된 순)를 옮겨 다니며 그 메시지로 이동
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchText.trim());
      setMatchIndex(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchText]);
  const search = useChatSearch(searchOpen ? actorId : undefined, searchQuery);
  const hits = useMemo(() => search.data?.pages.flat() ?? [], [search.data]);
  const activeMatchId = hits[matchIndex]?.id;
  const goOlderMatch = () => {
    if (matchIndex + 1 < hits.length) setMatchIndex(matchIndex + 1);
    // 불러온 결과의 끝이면 다음 결과 묶음을 받은 뒤 넘어감
    if (matchIndex + 2 >= hits.length && search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchText('');
    setHighlightId(null);
  };

  // 알림(focus)이나 검색 결과로 들어온 메시지로 이동해 강조 — 아직 안 불러온 예전 메시지면 찾을 때까지 이전 대화를 더
  // 불러옴(최대 MAX_FOCUS_PAGES). 이미 한 번 처리한 대상은 폴링으로 목록이 바뀌어도 다시 안 함
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const handledFocus = useRef<string | null>(null);
  const focusPaging = useRef<{ target: string | null; pages: number }>({ target: null, pages: 0 });
  const target = searchOpen ? (activeMatchId ?? null) : (focus ?? null);
  useEffect(() => {
    if (!target || handledFocus.current === target) return;
    const index = messages.findIndex((m) => m.id === target);
    if (index < 0) {
      const paging = focusPaging.current;
      if (paging.target !== target) focusPaging.current = { target, pages: 0 };
      if (isFetchingNextPage) return;
      if (hasNextPage && focusPaging.current.pages < MAX_FOCUS_PAGES) {
        focusPaging.current.pages += 1;
        void fetchNextPage();
      } else {
        handledFocus.current = target;
        if (searchOpen) void Promise.resolve().then(() => setNotice(t('chatSearch.notLoaded')));
      }
      return;
    }
    handledFocus.current = target;
    setHighlightId(target);
    const scroll = setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false }), 50);
    return () => clearTimeout(scroll);
  }, [target, messages, hasNextPage, isFetchingNextPage, fetchNextPage, searchOpen, t]);
  // 알림으로 온 강조는 잠깐만(검색 중엔 지금 결과를 계속 강조)
  useEffect(() => {
    if (!highlightId || searchOpen) return;
    const clear = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(clear);
  }, [highlightId, searchOpen]);

  useEffect(() => {
    navigation.setOptions({
      headerShadowVisible: false,
      headerStyle: { backgroundColor: theme.background },
      // 닉네임(크게) + 공식 이름(작게, 닉네임과 다를 때만) — 사진은 넣지 않음(카톡처럼). 누르면 대화방 프로필 카드
      headerTitleAlign: 'center',
      headerTitle: () =>
        actor ? (
          <Pressable onPress={() => openProfile()} style={styles.headerTitle} accessibilityRole="button" accessibilityHint={t('chatProfile.open')}>
            <ThemedText type="headline" numberOfLines={1} style={styles.headerName}>
              {actor.chatDisplayName}
            </ThemedText>
            {actor.legalName !== actor.chatDisplayName ? (
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.headerName}>
                {actor.legalName}
              </ThemedText>
            ) : null}
          </Pressable>
        ) : null,
      // 구독 중일 때만: 검색 + ⋯(사진·영상 모아보기, 채팅방별 알림, 구독 관리)
      headerRight: subscription
        ? () => (
            <View style={styles.headerActions}>
              <IconButton icon={Search} label={t('chatSearch.open')} onPress={() => setSearchOpen(true)} />
              <IconButton icon={Ellipsis} label={t('chat.more')} onPress={() => setMoreOpen((open) => !open)} />
            </View>
          )
        : undefined,
    });
  }, [actor, navigation, openProfile, subscription, t, theme]);

  // 알림 안내 등 짧은 문구는 잠깐 보였다 사라짐
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const saveVoice = (message: ChatMessage) => {
    if (!message.mediaUrl) return;
    saveMedia({ id: message.id, url: message.mediaUrl, mediaType: 'AUDIO' })
      .then((result) => setNotice(result === 'saved' ? t('media.saved') : null))
      .catch(() => setNotice(t('media.saveFailed')));
  };

  // 실패하면 쓴 글을 되돌려 놓고 이유를 보여줌(금칙어·차단·답장 한도 등)
  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setNotice(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    sendReply.mutate(body, {
      onError: (err) => {
        setDraft((current) => current || body);
        setNotice(err instanceof ApiError ? err.message : t('chat.sendFailed'));
      },
    });
  };

  // 음성 메시지 이어 듣기 — 각 음성 다음(더 최신)에 오는 음성(카톡처럼 하나 끝나면 다음 것 재생)
  const nextVoice = useMemo(() => {
    const map = new Map<string, string>();
    let newer: string | undefined;
    for (const message of messages) {
      if (message.mediaType !== 'AUDIO') continue;
      if (newer) map.set(message.id, newer);
      newer = message.id;
    }
    return map;
  }, [messages]);

  const copyText = (message: ChatMessage) => {
    setMenuFor(null);
    if (!message.body) return;
    Clipboard.setStringAsync(message.body)
      .then(() => setNotice(t('chat.copied')))
      .catch(() => setNotice(t('chat.copyFailed')));
  };

  // 버블 방식: 팬 답장은 가장 최근 스타 메시지에 붙음 — 구독 후 스타 메시지가 아직 없으면 입력창 대신 안내
  const canReply = messages.some((message) => message.senderType === 'ARTIST');
  const { data: quota } = useReplyQuota(actorId, canReply);
  const outOfReplies = !!quota && quota.remaining === 0;

  const body = isLoading ? (
    <ActivityIndicator style={styles.loading} color={theme.tint} />
  ) : notSubscribed ? (
    // 403 = 구독이 없음(해지·만료) — 다시 구독하는 길을 보여줌
    <EmptyState
      icon={Lock}
      title={t('chat.notSubscribedTitle')}
      body={t('chat.notSubscribed', { name: actor?.chatDisplayName ?? '' })}
      action={<Button title={t('chat.resubscribe')} onPress={() => router.replace({ pathname: '/actor/[id]', params: { id: actorId } })} />}
    />
  ) : isError ? (
    <EmptyState
      icon={CloudOff}
      title={t('chat.loadFailed')}
      action={<Button title={t('discover.retry')} variant="secondary" onPress={() => void refetch()} />}
    />
  ) : (
    <View style={styles.listArea}>
      <FlatList
        ref={listRef}
        inverted
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onScroll={onScroll}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: AT_BOTTOM_PX }}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
          setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false }), 100);
        }}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={theme.tint} style={styles.pageLoading} /> : null}
        ListEmptyComponent={
          <View style={styles.flip}>
            <EmptyState icon={MessageCircleHeart} title={t('chat.waitingTitle')} body={t('chat.waitingFirst', { name: actor?.chatDisplayName ?? '' })} />
          </View>
        }
        renderItem={({ item, index }) => {
          // 뒤집힌 목록: index-1이 더 최신, index+1이 더 오래된 메시지
          const newer = messages[index - 1];
          const older = messages[index + 1];
          // 커플방은 보낸 배우가 바뀌어도 묶음을 나눔(누가 보냈는지 보이게)
          const sameSender = (a: ChatMessage, b: ChatMessage) => a.senderType === b.senderType && (!isCouple || a.sender?.id === b.sender?.id);
          const endsGroup = !newer || !sameSender(newer, item) || !sameMinute(newer.createdAt, item.createdAt);
          const dayChanged = !older || !sameDay(older.createdAt, item.createdAt);
          const startsGroup = !older || !sameSender(older, item) || !sameMinute(item.createdAt, older.createdAt);
          return (
            <View>
              {dayChanged && <DaySeparator iso={item.createdAt} locale={i18n.language} />}
              <MessageRow
                message={item}
                avatarUri={isCouple ? (item.sender?.chatProfileImageUrl ?? actor?.chatProfileImageUrl) : actor?.chatProfileImageUrl}
                actorName={isCouple ? (item.sender?.chatDisplayName ?? actor?.chatDisplayName) : actor?.chatDisplayName}
                startsGroup={startsGroup}
                endsGroup={endsGroup}
                onOpenProfile={() => openProfile(isCouple ? item.sender?.id : undefined)}
                highlighted={item.id === highlightId && (!searchOpen || item.id === activeMatchId)}
                menuOpen={menuFor === item.id}
                onOpenMenu={() => setMenuFor(item.id)}
                onCloseMenu={() => setMenuFor(null)}
                onReport={() => {
                  setMenuFor(null);
                  router.push({ pathname: '/report', params: { messageId: item.id } });
                }}
                onSaveVoice={() => saveVoice(item)}
                onCopy={() => copyText(item)}
                actorId={actorId}
                nextVoiceId={nextVoice.get(item.id)}
              />
            </View>
          );
        }}
      />
      {unseen > 0 && (
        <Pressable
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          style={[styles.newPill, { backgroundColor: theme.primary }]}
          accessibilityRole="button">
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            {t('chat.newMessages', { count: unseen })}
          </ThemedText>
        </Pressable>
      )}
      {notice && (
        <Pressable onPress={() => setNotice(null)} style={[styles.toast, { backgroundColor: theme.primary }]}>
          <ThemedText type="small" style={{ color: theme.onPrimary, textAlign: 'center' }}>
            {notice}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );

  const showComposer = !isLoading && !isError;
  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <SafeAreaView style={styles.inner} edges={['bottom']}>
        {searchOpen && (
          <View style={[styles.searchBar, { borderBottomColor: theme.border }]}>
            <View style={[styles.searchField, { backgroundColor: theme.backgroundElement }]}>
              <Icon as={Search} size={16} color={theme.textTertiary} />
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder={t('chatSearch.placeholder')}
                placeholderTextColor={theme.textTertiary}
                style={[styles.searchInput, { color: theme.text }, fontFor(400, i18n.language)]}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={goOlderMatch}
                maxLength={50}
                accessibilityLabel={t('chatSearch.placeholder')}
              />
              {search.isFetching ? <ActivityIndicator size="small" color={theme.textTertiary} /> : null}
            </View>
            {searchQuery.length > 0 && !search.isFetching ? (
              <ThemedText type="caption" themeColor="textTertiary" style={styles.searchCount} numberOfLines={1}>
                {searchQuery.length < 2
                  ? t('chatSearch.tooShort')
                  : hits.length === 0
                    ? t('chatSearch.noResults')
                    : t(search.hasNextPage ? 'chatSearch.countMore' : 'chatSearch.count', { current: matchIndex + 1, total: hits.length })}
              </ThemedText>
            ) : null}
            <IconButton icon={ChevronUp} label={t('chatSearch.older')} onPress={goOlderMatch} disabled={matchIndex + 1 >= hits.length && !search.hasNextPage} />
            <IconButton icon={ChevronDown} label={t('chatSearch.newer')} onPress={() => setMatchIndex(Math.max(matchIndex - 1, 0))} disabled={matchIndex === 0} />
            <IconButton icon={X} label={t('chatSearch.close')} onPress={closeSearch} />
          </View>
        )}
        {body}
        {moreOpen && subscription && (
          <>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoreOpen(false)} accessibilityLabel={t('chat.closeMenu')} />
            <View style={[styles.moreMenu, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <MoreItem
                icon={Images}
                label={t('gallery.open')}
                onPress={() => {
                  setMoreOpen(false);
                  router.push({ pathname: '/media-gallery/[actorId]', params: { actorId } });
                }}
              />
              <MoreItem
                icon={subscription.notificationsMuted ? Bell : BellOff}
                label={t(subscription.notificationsMuted ? 'chat.unmute' : 'chat.mute')}
                onPress={() => {
                  setMoreOpen(false);
                  setNotice(t(subscription.notificationsMuted ? 'chat.unmuted' : 'chat.muted'));
                  setMuted.mutate(!subscription.notificationsMuted);
                }}
              />
              <MoreItem
                icon={CreditCard}
                label={t('mypage.subscriptions')}
                onPress={() => {
                  setMoreOpen(false);
                  router.push({ pathname: '/subscriptions/[actorId]', params: { actorId } });
                }}
              />
            </View>
          </>
        )}
        {showComposer && !searchOpen &&
          (!canReply || outOfReplies ? (
            <View style={[styles.waitingBar, { borderTopColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {canReply ? t('chat.noRepliesLeft', { limit: quota?.limit }) : t('chat.replyAfterFirst')}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.composer}>
              {quota && (
                <ThemedText type="caption" themeColor="textTertiary" style={styles.quota}>
                  {t('chat.repliesLeft', { count: quota.remaining })}
                </ThemedText>
              )}
              <View style={styles.inputRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={t('chat.replyPlaceholder')}
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }, fontFor(400, i18n.language)]}
                  multiline
                  // 웹 textarea가 기본 두 줄 높이로 커지지 않게
                  numberOfLines={1}
                  maxLength={1000}
                />
                <Pressable
                  onPress={handleSend}
                  disabled={sendReply.isPending || !draft.trim()}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.send')}
                  style={[styles.sendButton, { backgroundColor: draft.trim() ? theme.tint : theme.backgroundElement }]}>
                  {sendReply.isPending ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Icon as={ArrowUp} size={20} strokeWidth={2.25} color={draft.trim() ? '#ffffff' : theme.textTertiary} />
                  )}
                </Pressable>
              </View>
            </View>
          ))}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function MoreItem({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.moreItem} accessibilityRole="menuitem">
      <Icon as={icon} size={18} color={theme.text} />
      <ThemedText type="smallMedium">{label}</ThemedText>
    </Pressable>
  );
}

function DaySeparator({ iso, locale }: { iso: string; locale: string }) {
  return (
    <ThemedText type="caption" themeColor="textTertiary" style={styles.day}>
      {new Date(iso).toLocaleDateString(locale, { month: 'long', day: 'numeric', weekday: 'short' })}
    </ThemedText>
  );
}

function MessageRow({
  message,
  avatarUri,
  actorName,
  startsGroup,
  endsGroup,
  onOpenProfile,
  highlighted,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onReport,
  onSaveVoice,
  onCopy,
  actorId,
  nextVoiceId,
}: {
  message: ChatMessage;
  avatarUri?: string | null;
  actorName?: string;
  startsGroup: boolean;
  endsGroup: boolean;
  onOpenProfile: () => void;
  highlighted: boolean;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onReport: () => void;
  onSaveVoice: () => void;
  onCopy: () => void;
  actorId: string;
  nextVoiceId?: string;
}) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const isArtist = message.senderType === 'ARTIST';
  const isMedia = message.mediaType === 'PHOTO' || message.mediaType === 'VIDEO';
  const time = new Date(message.createdAt).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' });
  // 길게 누르면: 글이 있으면 복사(카톡처럼, 내 답장도), 스타 메시지면 신고
  const hasMenu = isArtist || !!message.body;

  const bubble = (
    <Pressable
      onLongPress={hasMenu ? onOpenMenu : undefined}
      delayLongPress={350}
      accessibilityHint={hasMenu ? t('chat.messageActions') : undefined}
      accessibilityActions={[
        ...(message.body ? [{ name: 'copy', label: t('chat.copy') }] : []),
        ...(isArtist ? [{ name: 'report', label: t('chat.report') }] : []),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'report') onReport();
        if (event.nativeEvent.actionName === 'copy') onCopy();
      }}
      style={[styles.bubbleWrap, highlighted && { borderRadius: Radius.lg + 2, borderWidth: 2, borderColor: theme.tint }]}>
      {isMedia ? (
        <View style={styles.mediaGroup}>
          {message.replyTo && <QuoteBlock quote={message.replyTo} tone="dark" />}
          <MediaTile
            id={message.id}
            url={message.mediaUrl}
            mediaType={message.mediaType as 'PHOTO' | 'VIDEO'}
            durationMs={message.mediaDurationMs}
            thumbnailUrl={message.thumbnailUrl}
            thumbhash={message.thumbhash}
            actorId={actorId}
          />
          {message.body ? (
            <View style={[styles.bubble, { backgroundColor: theme.backgroundElement }]}>
              <TranslatableText actorId={actorId} messageId={message.id} text={message.body} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.bubble, { backgroundColor: isArtist ? theme.backgroundElement : theme.tintSoft }]}>
          {message.replyTo && <QuoteBlock quote={message.replyTo} tone="dark" />}
          {message.mediaType === 'AUDIO' ? (
            <VoiceMessage
              id={message.id}
              url={message.mediaUrl}
              durationMs={message.mediaDurationMs}
              waveform={message.waveform}
              tone="dark"
              onSave={onSaveVoice}
              nextId={nextVoiceId}
            />
          ) : null}
          {/* 스타 메시지는 다른 언어면 "번역 보기"(내 답장은 번역 안 함) */}
          {message.body ? isArtist ? <TranslatableText actorId={actorId} messageId={message.id} text={message.body} /> : <ThemedText>{message.body}</ThemedText> : null}
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={[styles.row, !endsGroup && styles.rowTight]}>
      <View style={[styles.line, isArtist ? styles.lineLeft : styles.lineRight]}>
        {isArtist && (
          <View style={styles.avatarSlot}>
            {startsGroup ? (
              <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel={t('chatProfile.open')}>
                <Avatar uri={avatarUri} size={36} />
              </Pressable>
            ) : null}
          </View>
        )}
        <View style={[styles.column, isArtist ? styles.columnLeft : styles.columnRight]}>
          {isArtist && startsGroup ? (
            <ThemedText type="captionBold" themeColor="textSecondary" style={styles.senderLabel} numberOfLines={1}>
              {actorName}
            </ThemedText>
          ) : null}
          {bubble}
          {menuOpen && (
            <View style={[styles.menu, { backgroundColor: theme.background, borderColor: theme.border }]}>
              {message.body ? (
                <Pressable onPress={onCopy} style={styles.menuItem} accessibilityRole="button">
                  <Icon as={Copy} size={16} color={theme.text} />
                  <ThemedText type="smallBold">{t('chat.copy')}</ThemedText>
                </Pressable>
              ) : null}
              {isArtist ? (
                <Pressable onPress={onReport} style={styles.menuItem} accessibilityRole="button">
                  <Icon as={Flag} size={16} color={theme.danger} />
                  <ThemedText type="smallBold" themeColor="danger">
                    {t('chat.report')}
                  </ThemedText>
                </Pressable>
              ) : null}
              <IconButton icon={X} size={16} label={t('chat.closeMenu')} onPress={onCloseMenu} style={styles.menuClose} />
            </View>
          )}
          {endsGroup && (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.time}>
              {time}
            </ThemedText>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  headerTitle: { maxWidth: 220, alignItems: 'center' },
  headerName: { textAlign: 'center' },
  moreMenu: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.three,
    minWidth: 200,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingVertical: Spacing.one,
  },
  moreItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  searchField: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, minHeight: 40 },
  searchCount: { flexShrink: 0, marginLeft: Spacing.one },
  searchInput: { flex: 1, minWidth: 0, width: '100%', fontSize: 15, paddingVertical: Spacing.two, outlineStyle: 'none' } as object,
  listArea: { flex: 1 },
  list: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  // 뒤집힌 목록 안의 빈 화면은 위아래가 뒤집혀 보이지 않게
  flip: { transform: [{ scaleY: -1 }] },
  pageLoading: { marginVertical: Spacing.three },
  loading: { marginTop: Spacing.six },
  day: { textAlign: 'center', marginVertical: Spacing.three },
  row: { marginBottom: Spacing.three },
  rowTight: { marginBottom: 4 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  lineLeft: { justifyContent: 'flex-start' },
  lineRight: { justifyContent: 'flex-end' },
  avatarSlot: { width: 36 },
  column: { maxWidth: '78%', gap: 4 },
  columnLeft: { alignItems: 'flex-start' },
  columnRight: { alignItems: 'flex-end' },
  bubbleWrap: { maxWidth: '100%' },
  bubble: { borderRadius: Radius.lg + 2, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  mediaGroup: { gap: 4 },
  time: { paddingHorizontal: 4 },
  senderLabel: { paddingHorizontal: 4 },
  menu: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingLeft: Spacing.three,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.two, paddingRight: Spacing.three },
  menuClose: { width: 36, height: 36 },
  newPill: {
    position: 'absolute',
    bottom: Spacing.three,
    alignSelf: 'center',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  toast: {
    position: 'absolute',
    top: Spacing.three,
    alignSelf: 'center',
    maxWidth: '86%',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  composer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.two, gap: 4 },
  quota: { paddingHorizontal: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    outlineStyle: 'none',
  } as object,
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  waitingBar: { padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  center: { textAlign: 'center' },
});
