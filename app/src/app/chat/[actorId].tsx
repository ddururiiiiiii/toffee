import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ArrowUp, Bell, BellOff, CloudOff, Copy, Flag, Images, Lock, MessageCircleHeart, X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { MediaTile } from '@/components/media-tile';
import { QuoteBlock } from '@/components/quote-block';
import { VoiceMessage } from '@/components/voice-message';
import { ApiError } from '@/lib/api-client';
import { saveMedia } from '@/lib/save-media';
import { useActor } from '@/hooks/use-actors';
import { useActorMessages, useReplyQuota, useSendReply, type ChatMessage } from '@/hooks/use-messages';
import { useMySubscriptions, useSetNotificationsMuted } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { fontFor, MaxContentWidth, Radius, Spacing } from '@/constants/theme';

// 맨 아래(최신)에서 이만큼 안쪽이면 "맨 아래를 보고 있음" — 새 메시지를 따라감
const AT_BOTTOM_PX = 80;
// 같은 사람이 이 시간 안에 이어 보낸 메시지는 한 묶음(시간·프로필 사진은 묶음 끝에 한 번)
const GROUP_GAP_MS = 5 * 60 * 1000;

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * 팬 채팅방 — 시안 2A Minimal Premium(docs/product/brand/exploration/2a-chat-minimal-premium.png) + DESIGN_GUIDE §9.
 * 실제 1:1 DM처럼 조용하고 여백 있게: 스타는 왼쪽 Cloud 말풍선(묶음 끝에 작은 프로필 사진), 팬은 오른쪽 Periwinkle.
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
  const { data: subscriptions } = useMySubscriptions();
  const subscription = subscriptions?.find((s) => s.actorId === actorId);
  const setMuted = useSetNotificationsMuted(actorId);
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useActorMessages(actorId);
  const notSubscribed = error instanceof ApiError && error.status === 403;
  const sendReply = useSendReply(actorId);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

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

  // 알림으로 들어왔으면 그 메시지로 이동해 잠깐 강조(이미 한 번 처리한 focus는 폴링으로 목록이 바뀌어도 다시 안 함)
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const handledFocus = useRef<string | null>(null);
  useEffect(() => {
    const index = focus ? messages.findIndex((m) => m.id === focus) : -1;
    if (!focus || index < 0 || handledFocus.current === focus) return;
    handledFocus.current = focus;
    setHighlightId(focus);
    const scroll = setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false }), 50);
    const clear = setTimeout(() => setHighlightId(null), 2500);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, [focus, messages]);

  useEffect(() => {
    navigation.setOptions({
      headerShadowVisible: false,
      headerStyle: { backgroundColor: theme.background },
      headerTitle: () =>
        actor ? (
          <View style={styles.headerTitle}>
            <Avatar uri={actor.chatProfileImageUrl} name={actor.chatDisplayName} size={34} />
            <ThemedText type="headline" numberOfLines={1}>
              {actor.chatDisplayName}
            </ThemedText>
          </View>
        ) : null,
      // 구독 중일 때만: 사진·영상 모아보기(카톡 서랍처럼), 채팅방별 알림 끄기
      headerRight: subscription
        ? () => (
            <View style={styles.headerActions}>
              <IconButton
                icon={Images}
                label={t('gallery.open')}
                onPress={() => router.push({ pathname: '/media-gallery/[actorId]', params: { actorId } })}
              />
              <IconButton
                icon={subscription.notificationsMuted ? BellOff : Bell}
                label={t(subscription.notificationsMuted ? 'chat.notificationsOff' : 'chat.notificationsOn')}
                color={subscription.notificationsMuted ? theme.textTertiary : theme.text}
                onPress={() => {
                  setNotice(t(subscription.notificationsMuted ? 'chat.unmuted' : 'chat.muted'));
                  setMuted.mutate(!subscription.notificationsMuted);
                }}
              />
            </View>
          )
        : undefined,
    });
  }, [actor, actorId, navigation, router, subscription, setMuted, t, theme]);

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
          const endsGroup =
            !newer ||
            newer.senderType !== item.senderType ||
            new Date(newer.createdAt).getTime() - new Date(item.createdAt).getTime() > GROUP_GAP_MS ||
            !sameDay(newer.createdAt, item.createdAt);
          const dayChanged = !older || !sameDay(older.createdAt, item.createdAt);
          return (
            <View>
              {dayChanged && <DaySeparator iso={item.createdAt} locale={i18n.language} />}
              <MessageRow
                message={item}
                avatarUri={actor?.chatProfileImageUrl}
                actorName={actor?.chatDisplayName}
                showAvatarAndTime={endsGroup}
                highlighted={item.id === highlightId}
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
        {body}
        {showComposer &&
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
  showAvatarAndTime,
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
  showAvatarAndTime: boolean;
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
              <ThemedText>{message.body}</ThemedText>
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
          {message.body ? <ThemedText>{message.body}</ThemedText> : null}
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={[styles.row, !showAvatarAndTime && styles.rowTight]}>
      <View style={[styles.line, isArtist ? styles.lineLeft : styles.lineRight]}>
        {isArtist && (
          <View style={styles.avatarSlot}>
            {showAvatarAndTime ? <Avatar uri={avatarUri} name={actorName} size={30} /> : null}
          </View>
        )}
        <View style={[styles.column, isArtist ? styles.columnLeft : styles.columnRight]}>
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
          {showAvatarAndTime && (
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
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, maxWidth: 240 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  listArea: { flex: 1 },
  list: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  // 뒤집힌 목록 안의 빈 화면은 위아래가 뒤집혀 보이지 않게
  flip: { transform: [{ scaleY: -1 }] },
  pageLoading: { marginVertical: Spacing.three },
  loading: { marginTop: Spacing.six },
  day: { textAlign: 'center', marginVertical: Spacing.three },
  row: { marginBottom: Spacing.three },
  rowTight: { marginBottom: 4 },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  lineLeft: { justifyContent: 'flex-start' },
  lineRight: { justifyContent: 'flex-end' },
  avatarSlot: { width: 30, marginBottom: 20 },
  column: { maxWidth: '78%', gap: 4 },
  columnLeft: { alignItems: 'flex-start' },
  columnRight: { alignItems: 'flex-end' },
  bubbleWrap: { maxWidth: '100%' },
  bubble: { borderRadius: Radius.lg + 2, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  mediaGroup: { gap: 4 },
  time: { paddingHorizontal: 4 },
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
