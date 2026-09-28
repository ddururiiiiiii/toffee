import { useEffect, useState } from 'react';
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
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActor } from '@/hooks/use-actors';
import { useCreateStory, useStudioMessages, useStudioSend, type Attachment, type StudioMessage } from '@/hooks/use-studio';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 앨범/카메라에서 고른 파일 → 첨부물. iOS는 HEIC 대신 호환 형식(JPEG)으로 받아서 안드로이드·웹 팬도 볼 수 있게.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images', 'videos'],
  quality: 0.8,
  videoMaxDuration: 300,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

function toAttachment(result: ImagePicker.ImagePickerResult): Attachment | null {
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return { mediaType: asset.type === 'video' ? 'VIDEO' : 'PHOTO', uri: asset.uri, contentType: asset.mimeType };
}

function MyMessage({ message, onOpenReplies }: { message: StudioMessage; onOpenReplies: () => void }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  return (
    <ThemedView style={styles.messageRow}>
      <ThemedView style={[styles.bubble, { backgroundColor: theme.tint }]}>
        {message.mediaType === 'PHOTO' && message.mediaUrl ? (
          <Image source={{ uri: message.mediaUrl }} style={styles.bubbleImage} />
        ) : message.mediaType !== 'TEXT' ? (
          <ThemedText style={styles.bubbleText}>{t(`studio.media.${message.mediaType}`)}</ThemedText>
        ) : null}
        {message.body && <ThemedText style={styles.bubbleText}>{message.body}</ThemedText>}
      </ThemedView>
      <ThemedView style={styles.messageMeta}>
        <ThemedText type="small" themeColor="textSecondary">
          {new Date(message.createdAt).toLocaleString(i18n.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </ThemedText>
        <Pressable onPress={onOpenReplies} hitSlop={8}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {message.replyCount > 0 ? `${t('studio.replies', { count: message.replyCount })} ›` : t('studio.noReplies')}
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

// 배우 본인이 팬들에게 보내는 화면 — 카톡처럼 아래 입력창에서 텍스트/사진·영상/음성을 보내고,
// 위로는 내가 보낸 메시지가 쌓이며 메시지마다 팬 답장 모아보기로 들어갈 수 있음.
export default function StudioChannelScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { actorId } = useLocalSearchParams<{ actorId: string }>();
  const { data: actor } = useActor(actorId);
  const { data: messages, isLoading } = useStudioMessages(actorId);
  const send = useStudioSend(actorId);
  const createStory = useCreateStory(actorId);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const pickStory = async () => {
    const picked = toAttachment(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
    if (!picked) return;
    createStory.mutate(picked, {
      onSuccess: () => setNotice({ text: t('studio.storyPosted'), error: false }),
      onError: () => setNotice({ text: t('studio.storyFailed'), error: true }),
    });
  };

  useEffect(() => {
    navigation.setOptions({
      title: actor?.chatDisplayName ?? '',
      headerRight: () => (
        <Pressable onPress={pickStory} disabled={createStory.isPending} hitSlop={8}>
          {createStory.isPending ? (
            <ActivityIndicator color={theme.tint} />
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {t('studio.postStory')}
            </ThemedText>
          )}
        </Pressable>
      ),
    });
    // pickStory는 렌더마다 새로 만들어지지만 필요한 값(actorId/t)이 바뀔 때만 다시 등록하면 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, navigation, createStory.isPending, t, theme.tint]);

  const pickFromLibrary = async () => {
    const picked = toAttachment(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
    if (picked) setAttachment(picked);
  };

  const takeWithCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setNotice({ text: t('studio.permissionDenied'), error: true });
      return;
    }
    const picked = toAttachment(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
    if (picked) setAttachment(picked);
  };

  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (recorder.uri) setAttachment({ mediaType: 'AUDIO', uri: recorder.uri });
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setNotice({ text: t('studio.permissionDenied'), error: true });
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setAttachment(null);
  };

  const handleSend = () => {
    const body = draft.trim();
    if (!body && !attachment) return;
    setNotice(null);
    send.mutate(
      { body, attachment },
      {
        onSuccess: () => {
          setDraft('');
          setAttachment(null);
        },
        onError: () => setNotice({ text: t('studio.sendFailed'), error: true }),
      },
    );
  };

  const canSend = !send.isPending && !recorderState.isRecording && (!!draft.trim() || !!attachment);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {isLoading ? (
          <ActivityIndicator style={styles.loading} color={theme.tint} />
        ) : (
          <FlatList
            inverted
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {t('studio.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <MyMessage message={item} onOpenReplies={() => router.push(`/studio/${actorId}/replies/${item.id}`)} />
            )}
          />
        )}

        {notice && (
          <ThemedText
            type="small"
            themeColor={notice.error ? 'danger' : 'textSecondary'}
            style={styles.notice}
            onPress={() => setNotice(null)}>
            {notice.text}
          </ThemedText>
        )}

        {(attachment || recorderState.isRecording) && (
          <ThemedView type="tintSoft" style={styles.attachmentBar}>
            {recorderState.isRecording ? (
              <ThemedText type="smallBold">
                🔴 {t('studio.recording', { seconds: Math.floor(recorderState.durationMillis / 1000) })}
              </ThemedText>
            ) : attachment?.mediaType === 'PHOTO' ? (
              <Image source={{ uri: attachment.uri }} style={styles.attachmentThumb} />
            ) : (
              <ThemedText type="smallBold">{attachment && t(`studio.media.${attachment.mediaType}`)}</ThemedText>
            )}
            {attachment && !recorderState.isRecording && (
              <>
                <ThemedText type="small" style={styles.attachmentLabel}>
                  {t(`studio.attached.${attachment.mediaType}`)}
                </ThemedText>
                <Pressable onPress={() => setAttachment(null)} hitSlop={8}>
                  <ThemedText type="smallBold" themeColor="danger">
                    {t('studio.removeAttachment')}
                  </ThemedText>
                </Pressable>
              </>
            )}
          </ThemedView>
        )}

        <ThemedView style={[styles.tools, { borderTopColor: theme.backgroundElement }]}>
          <Pressable onPress={pickFromLibrary} disabled={recorderState.isRecording} style={styles.tool}>
            <ThemedText type="small">🖼️ {t('studio.attachLibrary')}</ThemedText>
          </Pressable>
          {Platform.OS !== 'web' && (
            <Pressable onPress={takeWithCamera} disabled={recorderState.isRecording} style={styles.tool}>
              <ThemedText type="small">📷 {t('studio.camera')}</ThemedText>
            </Pressable>
          )}
          <Pressable onPress={toggleRecording} style={styles.tool}>
            <ThemedText type="small" themeColor={recorderState.isRecording ? 'danger' : undefined}>
              {recorderState.isRecording ? `⏹ ${t('studio.stopRecording')}` : `🎙️ ${t('studio.record')}`}
            </ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('studio.inputPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={[styles.sendButton, { backgroundColor: theme.tint, opacity: canSend ? 1 : 0.5 }]}>
            {send.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.sendButtonText}>{t('studio.send')}</ThemedText>
            )}
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  list: { padding: Spacing.three, gap: Spacing.three },
  empty: { textAlign: 'center', marginTop: Spacing.four, transform: [{ scaleY: -1 }] },
  messageRow: { alignItems: 'flex-end', gap: 4 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 4 },
  bubbleText: { color: '#fff' },
  bubbleImage: { width: 200, height: 200, borderRadius: 10 },
  messageMeta: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  notice: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, textAlign: 'center' },
  attachmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    borderRadius: 12,
    padding: Spacing.two,
  },
  attachmentThumb: { width: 44, height: 44, borderRadius: 8 },
  attachmentLabel: { flex: 1 },
  tools: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  tool: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, padding: Spacing.three },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16, maxHeight: 100 },
  sendButton: { borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minWidth: 56, alignItems: 'center' },
  sendButtonText: { color: '#fff', fontWeight: '600' },
});
