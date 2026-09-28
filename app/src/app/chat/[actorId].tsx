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
import { ThemedView } from '@/components/themed-view';
import { MediaTile } from '@/components/media-tile';
import { QuoteBlock } from '@/components/quote-block';
import { VoiceMessage } from '@/components/voice-message';
import { saveMedia } from '@/lib/save-media';
import { useActor } from '@/hooks/use-actors';
import { useActorMessages, useSendReply, type ChatMessage } from '@/hooks/use-messages';
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
  const { actorId } = useLocalSearchParams<{ actorId: string }>();
  const { data: actor } = useActor(actorId);
  const { data: messages, isLoading, isError } = useActorMessages(actorId);
  const sendReply = useSendReply(actorId);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (actor) navigation.setOptions({ title: actor.chatDisplayName });
  }, [actor, navigation]);

  const saveVoice = (message: ChatMessage) => {
    if (!message.mediaUrl) return;
    setNotice(null);
    saveMedia({ id: message.id, url: message.mediaUrl, mediaType: 'AUDIO' })
      .then((result) => setNotice(result === 'saved' ? t('media.saved') : null))
      .catch(() => setNotice(t('media.saveFailed')));
  };

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    sendReply.mutate(body);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {isLoading ? (
          <ActivityIndicator style={styles.loading} color={theme.tint} />
        ) : isError ? (
          <ThemedText style={styles.centerMessage} themeColor="danger">
            {t('chat.loadFailed')}
          </ThemedText>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => <MessageBubble message={item} onSaveVoice={() => saveVoice(item)} />}
          />
        )}

        {notice && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.notice} onPress={() => setNotice(null)}>
            {notice}
          </ThemedText>
        )}

        <ThemedView style={[styles.inputRow, { borderTopColor: theme.backgroundElement }]}>
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
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  // 행 컨테이너는 배경 없이(ThemedView 기본 흰 배경이 회색 화면 위에 띠처럼 보였음)
  bubbleRow: { flexDirection: 'row', backgroundColor: 'transparent' },
  bubbleRowLeft: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  menu: { flexDirection: 'row', gap: 10, paddingHorizontal: 6, paddingBottom: 4, backgroundColor: 'transparent' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 4 },
  notice: { textAlign: 'center', paddingVertical: Spacing.one },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16, maxHeight: 100 },
  sendButton: { borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  sendButtonText: { color: '#fff', fontWeight: '600' },
  loading: { marginTop: Spacing.six },
  centerMessage: { textAlign: 'center', marginTop: Spacing.six, paddingHorizontal: Spacing.four },
});
