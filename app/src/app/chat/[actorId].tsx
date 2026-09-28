import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ApiError } from '@/lib/api-client';
import { useMySubscriptions, useSetNotificationsMuted } from '@/hooks/use-subscriptions';
import { ThemedView } from '@/components/themed-view';
import { MediaTile } from '@/components/media-tile';
import { QuoteBlock } from '@/components/quote-block';
import { VoiceMessage } from '@/components/voice-message';
import { saveMedia } from '@/lib/save-media';
import { useActor } from '@/hooks/use-actors';
import { useActorMessages, useReplyQuota, useSendReply, type ChatMessage } from '@/hooks/use-messages';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

function MessageBubble({ message, onSaveVoice }: { message: ChatMessage; onSaveVoice: () => void }) {
  const theme = useTheme();
  const isArtist = message.senderType === 'ARTIST';
  const bubbleColor = isArtist ? theme.backgroundElement : theme.tint;
  const textColor = isArtist ? theme.text : '#fff';

  return (
    <ThemedView style={[styles.bubbleRow, isArtist ? styles.bubbleRowLeft : styles.bubbleRowRight]}>
      <ThemedView style={[styles.bubble, { backgroundColor: bubbleColor }]}>
        {message.replyTo && <QuoteBlock quote={message.replyTo} tone={isArtist ? 'dark' : 'light'} />}
        {message.mediaType === 'PHOTO' || message.mediaType === 'VIDEO' ? (
          <MediaTile id={message.id} url={message.mediaUrl} mediaType={message.mediaType} durationMs={message.mediaDurationMs} />
        ) : message.mediaType === 'AUDIO' ? (
          <VoiceMessage
            id={message.id}
            url={message.mediaUrl}
            durationMs={message.mediaDurationMs}
            waveform={message.waveform}
            tone={isArtist ? 'dark' : 'light'}
            onSave={onSaveVoice}
          />
        ) : null}
        {message.body && <ThemedText style={{ color: textColor }}>{message.body}</ThemedText>}
      </ThemedView>
      {isArtist && <ArtistMessageMenu messageId={message.id} />}
    </ThemedView>
  );
}

// 스타 메시지 옆 ⋯ → 신고(말풍선 안에 재생·보기 버튼이 있어 말풍선 전체를 길게 누르기 대신 별도 버튼으로)
function ArtistMessageMenu({ messageId }: { messageId: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return open ? (
    <ThemedView style={styles.menu}>
      <Pressable onPress={() => router.push({ pathname: '/report', params: { messageId } })} hitSlop={8}>
        <ThemedText type="smallBold" themeColor="danger">
          {t('report.action')}
        </ThemedText>
      </Pressable>
      <Pressable onPress={() => setOpen(false)} hitSlop={8}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          ✕
        </ThemedText>
      </Pressable>
    </ThemedView>
  ) : (
    <Pressable onPress={() => setOpen(true)} hitSlop={10} style={styles.menu} accessibilityLabel={t('safety.more')}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        ⋯
      </ThemedText>
    </Pressable>
  );
}

export default function ChatRoomScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();
  const { actorId } = useLocalSearchParams<{ actorId: string }>();
  const { data: actor } = useActor(actorId);
  const { data: subscriptions } = useMySubscriptions();
  const subscription = subscriptions?.find((s) => s.actorId === actorId);
  const setMuted = useSetNotificationsMuted(actorId);
  const { data: messages, isLoading, isError, error } = useActorMessages(actorId);
  const notSubscribed = error instanceof ApiError && error.status === 403;
  const sendReply = useSendReply(actorId);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (!actor) return;
    navigation.setOptions({
      title: actor.chatDisplayName,
      // 카톡처럼 채팅방별 알림 끄기 — 구독 중일 때만
      headerRight: subscription
        ? () => (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: !subscription.notificationsMuted }}
              accessibilityLabel={t(subscription.notificationsMuted ? 'chat.notificationsOff' : 'chat.notificationsOn')}
              onPress={() => {
                setNotice(t(subscription.notificationsMuted ? 'chat.unmuted' : 'chat.muted'));
                setMuted.mutate(!subscription.notificationsMuted);
              }}
              hitSlop={8}
              style={styles.headerButton}>
              <ThemedText>{subscription.notificationsMuted ? '🔕' : '🔔'}</ThemedText>
            </Pressable>
          )
        : undefined,
    });
  }, [actor, navigation, subscription, setMuted, t]);

  const saveVoice = (message: ChatMessage) => {
    if (!message.mediaUrl) return;
    setNotice(null);
    saveMedia({ id: message.id, url: message.mediaUrl, mediaType: 'AUDIO' })
      .then((result) => setNotice(result === 'saved' ? t('media.saved') : null))
      .catch(() => setNotice(t('media.saveFailed')));
  };

  // 실패하면 쓴 글을 되돌려 놓고 이유를 보여줌(예전엔 금칙어·차단 등으로 실패해도 글이 조용히 사라졌음)
  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setNotice(null);
    sendReply.mutate(body, {
      onError: (error) => {
        setDraft((current) => current || body);
        setNotice(error instanceof ApiError ? error.message : t('chat.sendFailed'));
      },
    });
  };
  // 버블 방식: 팬 답장은 가장 최근 스타 메시지에 붙음 — 구독 후 스타 메시지가 아직 없으면 답장할 곳이 없어서 입력창 대신 안내
  const canReply = !!messages?.some((message) => message.senderType === 'ARTIST');
  // 스타 메시지 하나당 답장 수 제한(기본 3) — 다 쓰면 다음 메시지까지 입력창 대신 안내
  const { data: quota } = useReplyQuota(actorId, canReply);
  const outOfReplies = !!quota && quota.remaining === 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {isLoading ? (
          <ActivityIndicator style={styles.loading} color={theme.tint} />
        ) : isError ? (
          // 403 = 구독이 없음(해지·만료) — 다시 구독하는 길을 보여줌
          notSubscribed ? (
            <ThemedView style={styles.endedBox}>
              <ThemedText style={styles.endedText} themeColor="textSecondary">
                {t('chat.notSubscribed', { name: actor?.chatDisplayName ?? '' })}
              </ThemedText>
              <Pressable
                onPress={() => router.replace({ pathname: '/actor/[id]', params: { id: actorId } })}
                style={[styles.sendButton, { backgroundColor: theme.tint }]}>
                <ThemedText style={styles.sendButtonText}>{t('chat.resubscribe')}</ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <ThemedText style={styles.centerMessage} themeColor="danger">
              {t('chat.loadFailed')}
            </ThemedText>
          )
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => <MessageBubble message={item} onSaveVoice={() => saveVoice(item)} />}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerMessage}>
                {t('chat.waitingFirst', { name: actor?.chatDisplayName ?? '' })}
              </ThemedText>
            }
          />
        )}

        {notice && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.notice} onPress={() => setNotice(null)}>
            {notice}
          </ThemedText>
        )}

        {isLoading || isError ? null : !canReply || outOfReplies ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={[styles.waitingBar, { borderTopColor: theme.backgroundElement }]}>
            {canReply ? t('chat.noRepliesLeft', { limit: quota?.limit }) : t('chat.replyAfterFirst')}
          </ThemedText>
        ) : (
          <ThemedView style={[styles.inputArea, { borderTopColor: theme.backgroundElement }]}>
            {quota && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.quota}>
                {t('chat.repliesLeft', { count: quota.remaining })}
              </ThemedText>
            )}
            <ThemedView style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('chat.replyPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                multiline
              />
              <Pressable
                onPress={handleSend}
                disabled={sendReply.isPending || !draft.trim()}
                style={[styles.sendButton, { backgroundColor: theme.tint, opacity: draft.trim() ? 1 : 0.5 }]}>
                <ThemedText style={styles.sendButtonText}>{t('chat.send')}</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerButton: { paddingHorizontal: Spacing.three },
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  // 행 컨테이너는 배경 없이(ThemedView 기본 흰 배경이 회색 화면 위에 띠처럼 보였음)
  bubbleRow: { flexDirection: 'row', backgroundColor: 'transparent' },
  bubbleRowLeft: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  menu: { flexDirection: 'row', gap: 10, paddingHorizontal: 6, paddingBottom: 4, backgroundColor: 'transparent' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 4 },
  notice: { textAlign: 'center', paddingVertical: Spacing.one },
  endedBox: { alignItems: 'center', gap: Spacing.three, marginTop: Spacing.six, paddingHorizontal: Spacing.four, backgroundColor: 'transparent' },
  endedText: { textAlign: 'center' },
  inputArea: { borderTopWidth: StyleSheet.hairlineWidth },
  quota: { paddingHorizontal: Spacing.three, paddingTop: Spacing.one },
  waitingBar: { textAlign: 'center', padding: Spacing.three, borderTopWidth: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16, maxHeight: 100 },
  sendButton: { borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  sendButtonText: { color: '#fff', fontWeight: '600' },
  loading: { marginTop: Spacing.six },
  centerMessage: { textAlign: 'center', marginTop: Spacing.six, paddingHorizontal: Spacing.four },
});
