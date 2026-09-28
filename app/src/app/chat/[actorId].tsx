import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VoiceMessage } from '@/components/voice-message';
import { useActor } from '@/hooks/use-actors';
import { useActorMessages, useSendReply, type ChatMessage } from '@/hooks/use-messages';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

function MessageBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const isArtist = message.senderType === 'ARTIST';
  const bubbleColor = isArtist ? theme.backgroundElement : theme.tint;
  const textColor = isArtist ? theme.text : '#fff';

  return (
    <ThemedView style={[styles.bubbleRow, isArtist ? styles.bubbleRowLeft : styles.bubbleRowRight]}>
      <ThemedView style={[styles.bubble, { backgroundColor: bubbleColor }]}>
        {message.mediaType === 'PHOTO' && message.mediaUrl ? (
          <Image source={{ uri: message.mediaUrl }} style={styles.bubbleImage} />
        ) : message.mediaType === 'AUDIO' ? (
          <VoiceMessage
            id={message.id}
            url={message.mediaUrl}
            durationMs={message.mediaDurationMs}
            waveform={message.waveform}
            tone={isArtist ? 'dark' : 'light'}
          />
        ) : null}
        {message.body && <ThemedText style={{ color: textColor }}>{message.body}</ThemedText>}
      </ThemedView>
    </ThemedView>
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
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (actor) navigation.setOptions({ title: actor.chatDisplayName });
  }, [actor, navigation]);

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
            renderItem={({ item }) => <MessageBubble message={item} />}
          />
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
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 4 },
  bubbleImage: { width: 200, height: 200, borderRadius: 10 },
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
