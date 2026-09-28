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
import { MediaTile } from '@/components/media-tile';
import { QuoteBlock } from '@/components/quote-block';
import { VoiceMessage } from '@/components/voice-message';
import { useActor } from '@/hooks/use-actors';
import { useDeleteBroadcast, useStudioMessages, useStudioSend, type Attachment, type StudioMessage } from '@/hooks/use-studio';
import { confirm } from '@/lib/confirm';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { dbToLevel, resample } from '@/lib/waveform';
import { NAME_TOKEN, showNameToken } from '@/utils/name-token';

// 음량 측정(metering)을 켜서 녹음 중 음파 모양을 모음 — 보낼 때 48칸으로 줄여서 같이 보냄
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
const WAVEFORM_BARS = 48;

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
  return {
    mediaType: asset.type === 'video' ? 'VIDEO' : 'PHOTO',
    uri: asset.uri,
    contentType: asset.mimeType,
    durationMs: asset.type === 'video' && asset.duration ? Math.round(asset.duration) : undefined,
  };
}

function MyMessage({
  message,
  onOpenReplies,
  onDelete,
}: {
  message: StudioMessage;
  onOpenReplies: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const hiddenByAdmin = !!message.deletedAt && message.deletedByAdmin;
  return (
    <ThemedView style={styles.messageRow}>
      {hiddenByAdmin && (
        <ThemedText type="small" themeColor="danger">
          {t('studio.hiddenByAdmin')}
        </ThemedText>
      )}
      <ThemedView style={[styles.bubble, { backgroundColor: theme.tint }, hiddenByAdmin && styles.hiddenBubble]}>
        {message.replyTo && <QuoteBlock quote={message.replyTo} tone="light" />}
        {message.mediaType === 'PHOTO' || message.mediaType === 'VIDEO' ? (
          <MediaTile id={message.id} url={message.mediaUrl} mediaType={message.mediaType} durationMs={message.mediaDurationMs} thumbnailUrl={message.thumbnailUrl} />
        ) : message.mediaType === 'AUDIO' ? (
          <VoiceMessage
            id={message.id}
            url={message.mediaUrl}
            durationMs={message.mediaDurationMs}
            waveform={message.waveform}
            tone="light"
          />
        ) : null}
        {message.body && <ThemedText style={styles.bubbleText}>{showNameToken(message.body, t('studio.fanNickname'))}</ThemedText>}
      </ThemedView>
      <ThemedView style={styles.messageMeta}>
        <ThemedText type="small" themeColor="textSecondary">
          {new Date(message.createdAt).toLocaleString(i18n.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </ThemedText>
        {!hiddenByAdmin && (
          <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button">
            <ThemedText type="small" themeColor="textSecondary">
              {t('studio.delete')}
            </ThemedText>
          </Pressable>
        )}
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
  // 팬 답장 모아보기에서 "답장하기"를 누르면 인용할 팬 메시지 정보를 들고 이 화면으로 옴
  const { actorId, quoteId, quoteNickname, quoteBody } = useLocalSearchParams<{
    actorId: string;
    quoteId?: string;
    quoteNickname?: string;
    quoteBody?: string;
  }>();
  const clearQuote = () => router.setParams({ quoteId: undefined, quoteNickname: undefined, quoteBody: undefined });
  const { data: actor } = useActor(actorId);
  const { data: messages, isLoading } = useStudioMessages(actorId);
  const send = useStudioSend(actorId);
  const deleteBroadcast = useDeleteBroadcast(actorId);
  const removeMessage = async (messageId: string) => {
    const ok = await confirm(t('studio.deleteTitle'), t('studio.deleteBody'), t('studio.delete'), t('common.cancel'));
    if (!ok) return;
    deleteBroadcast.mutate(messageId, { onError: () => setNotice({ text: t('studio.deleteFailed'), error: true }) });
  };
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const levels = useRef<number[]>([]);

  useEffect(() => {
    if (recorderState.isRecording) levels.current.push(dbToLevel(recorderState.metering));
  }, [recorderState.isRecording, recorderState.metering, recorderState.durationMillis]);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  // 스토리 올리기는 후순위(3차)로 미뤄서 이 화면엔 없음 — 서버 API는 남아 있음(STATUS.md)
  useEffect(() => {
    navigation.setOptions({
      title: actor?.chatDisplayName ?? '',
      headerRight: () => (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/studio/${actorId}/profile`)} style={styles.headerButton}>
          <ThemedText type="small" themeColor="tint">
            {t('studioProfile.headerButton')}
          </ThemedText>
        </Pressable>
      ),
    });
  }, [actor, navigation, router, actorId, t]);

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
      const durationMs = recorderState.durationMillis;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (recorder.uri) {
        const waveform = resample(levels.current, WAVEFORM_BARS).map((level) => Math.round(level * 100) / 100);
        setAttachment({ mediaType: 'AUDIO', uri: recorder.uri, durationMs, waveform });
      }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setNotice({ text: t('studio.permissionDenied'), error: true });
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    levels.current = [];
    recorder.record();
    setAttachment(null);
  };

  const handleSend = () => {
    const body = draft.trim();
    if (!body && !attachment) return;
    setNotice(null);
    send.mutate(
      { body, attachment, replyToMessageId: quoteId },
      {
        onSuccess: () => {
          setDraft('');
          setAttachment(null);
          if (quoteId) clearQuote();
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
            // 내가 지운 메시지는 안 보임(운영자가 가린 건 이유와 함께 보임)
            data={messages?.filter((message) => !message.deletedAt || message.deletedByAdmin)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {t('studio.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <MyMessage
                message={item}
                onOpenReplies={() => router.push(`/studio/${actorId}/replies/${item.id}`)}
                onDelete={() => void removeMessage(item.id)}
              />
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

        {quoteId && (
          <ThemedView type="tintSoft" style={styles.quoteBar}>
            <ThemedView style={styles.quoteBarText}>
              <ThemedText type="smallBold">↩ {t('quote.replyTo', { nickname: quoteNickname ?? '' })}</ThemedText>
              {quoteBody ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {quoteBody}
                </ThemedText>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                {t('quote.publicNotice')}
              </ThemedText>
            </ThemedView>
            <Pressable onPress={clearQuote} hitSlop={8}>
              <ThemedText type="smallBold" themeColor="danger">
                ✕
              </ThemedText>
            </Pressable>
          </ThemedView>
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
          {/* 받는 팬마다 그 팬의 닉네임으로 바뀌는 자리 — 버블처럼 "OO야" 하고 부를 때 */}
          <Pressable
            onPress={() => setDraft((current) => `${current}${NAME_TOKEN}`)}
            accessibilityHint={t('studio.insertNameHint')}
            style={styles.tool}>
            <ThemedText type="small">🏷️ {t('studio.insertName')}</ThemedText>
          </Pressable>
        </ThemedView>
        {draft.includes(NAME_TOKEN) && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.nameHint}>
            {t('studio.insertNameHint')}
          </ThemedText>
        )}

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
  hiddenBubble: { opacity: 0.45 },
  nameHint: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.one },
  headerButton: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  list: { padding: Spacing.three, gap: Spacing.three },
  empty: { textAlign: 'center', marginTop: Spacing.four, transform: [{ scaleY: -1 }] },
  messageRow: { alignItems: 'flex-end', gap: 4, backgroundColor: 'transparent' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 4 },
  bubbleText: { color: '#fff' },
  messageMeta: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center', backgroundColor: 'transparent' },
  notice: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, textAlign: 'center' },
  attachmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    borderRadius: 12,
    padding: Spacing.two,
  },
  quoteBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginHorizontal: Spacing.three, marginBottom: Spacing.two, borderRadius: 12, padding: Spacing.two },
  quoteBarText: { flex: 1, gap: 2, backgroundColor: 'transparent' },
  attachmentThumb: { width: 44, height: 44, borderRadius: 8 },
  attachmentLabel: { flex: 1 },
  tools: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  tool: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, padding: Spacing.three },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16, maxHeight: 100 },
  sendButton: { borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minWidth: 56, alignItems: 'center' },
  sendButtonText: { color: '#fff', fontWeight: '600' },
});
