import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { ArrowUp, AtSign, Camera, CornerUpLeft, ImagePlus, Mic, Send, Square, Trash2, UserRound, Video, X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { MediaTile } from '@/components/media-tile';
import { ReplyTicker } from '@/components/reply-ticker';
import { QuoteBlock } from '@/components/quote-block';
import { VoiceMessage } from '@/components/voice-message';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { useActor } from '@/hooks/use-actors';
import { useDeleteBroadcast, useStudioMessages, useStudioSend, type Attachment, type StudioMessage } from '@/hooks/use-studio';
import { PLAYBACK_AUDIO_MODE } from '@/lib/audio-mode';
import { confirm } from '@/lib/confirm';
import { UploadCancelledError } from '@/lib/upload-media';
import { useTheme } from '@/hooks/use-theme';
import { fontFor, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
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

function MyMessage({ message, onOpenReplies, onDelete }: { message: StudioMessage; onOpenReplies: () => void; onDelete: () => void }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const hiddenByAdmin = !!message.deletedAt && message.deletedByAdmin;
  // 최근 메시지엔 서버가 recentReplies를 줌(답장이 없으면 빈 배열 → "기다리는 중" 줄), 오래된 메시지는 숫자만
  const hasPreview = !!message.recentReplies && !hiddenByAdmin;
  const isMedia = message.mediaType === 'PHOTO' || message.mediaType === 'VIDEO';
  return (
    <View style={styles.messageRow}>
      {hiddenByAdmin && (
        <ThemedText type="small" themeColor="danger">
          {t('studio.hiddenByAdmin')}
        </ThemedText>
      )}
      <View style={[styles.column, hiddenByAdmin && styles.hidden]}>
        {isMedia ? (
          <>
            {message.replyTo && <QuoteBlock quote={message.replyTo} tone="dark" />}
            <MediaTile id={message.id} url={message.mediaUrl} mediaType={message.mediaType as 'PHOTO' | 'VIDEO'} durationMs={message.mediaDurationMs} thumbnailUrl={message.thumbnailUrl} thumbhash={message.thumbhash} />
          </>
        ) : null}
        {!isMedia || message.body ? (
          <View style={[styles.bubble, { backgroundColor: theme.tintSoft }]}>
            {!isMedia && message.replyTo && <QuoteBlock quote={message.replyTo} tone="dark" />}
            {message.mediaType === 'AUDIO' ? (
              <VoiceMessage id={message.id} url={message.mediaUrl} durationMs={message.mediaDurationMs} waveform={message.waveform} tone="dark" />
            ) : null}
            {message.body ? <ThemedText>{showNameToken(message.body, t('studio.fanNickname'))}</ThemedText> : null}
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <ThemedText type="caption" themeColor="textTertiary">
          {new Date(message.createdAt).toLocaleString(i18n.language, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </ThemedText>
        {!hiddenByAdmin && (
          <IconButton icon={Trash2} size={15} label={t('studio.delete')} color={theme.textTertiary} onPress={onDelete} style={styles.metaButton} />
        )}
        {!hasPreview && (
          <Pressable onPress={onOpenReplies} hitSlop={8} accessibilityRole="button">
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {message.replyCount > 0 ? `${t('studio.replies', { count: message.replyCount })} ›` : t('studio.noReplies')}
            </ThemedText>
          </Pressable>
        )}
      </View>
      {/* 최근 메시지는 팬 답장이 온 순서대로 한 줄씩 넘어가며 보임(버블·위버스 방식) */}
      {hasPreview && <ReplyTicker replies={message.recentReplies ?? []} count={message.replyCount} onPress={onOpenReplies} />}
    </View>
  );
}

/**
 * 스타(배우 본인)의 스튜디오 — 팬 채팅방(2A)과 같은 말투의 화면: 내가 보낸 메시지가 오른쪽 Periwinkle 말풍선으로 쌓이고,
 * 최근 메시지 아래엔 팬 답장 줄. 아래 입력창에서 글·사진/영상·음성을 보내고, "팬 이름 넣기"로 받는 팬마다 닉네임으로 부름.
 * 큰 영상은 올라가는 정도(%)와 취소 버튼을 보여줌(예전엔 돌기만 해서 멈춘 것처럼 보였음).
 */
export default function StudioChannelScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  // 팬 답장 화면에서 "답장하기"를 누르면 인용할 팬 메시지 정보를 들고 이 화면으로 옴
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
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const levels = useRef<number[]>([]);
  const uploadAbort = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (recorderState.isRecording) levels.current.push(dbToLevel(recorderState.metering));
  }, [recorderState.isRecording, recorderState.metering, recorderState.durationMillis]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  // 스토리 올리기는 후순위(3차)로 미뤄서 이 화면엔 없음 — 서버 API는 남아 있음(STATUS.md)
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () =>
        actor ? (
          <View style={styles.headerTitle}>
            <Avatar uri={actor.chatProfileImageUrl} name={actor.chatDisplayName} size={34} />
            <ThemedText type="headline" numberOfLines={1}>
              {actor.chatDisplayName}
            </ThemedText>
          </View>
        ) : null,
      headerRight: () => <IconButton icon={UserRound} label={t('studio.profileButton')} onPress={() => router.push(`/studio/${actorId}/profile`)} />,
    });
  }, [actor, navigation, router, actorId, t]);

  const removeMessage = async (messageId: string) => {
    const ok = await confirm(t('studio.deleteTitle'), t('studio.deleteBody'), t('studio.delete'), t('common.cancel'));
    if (!ok) return;
    deleteBroadcast.mutate(messageId, { onError: () => setNotice({ text: t('studio.deleteFailed'), error: true }) });
  };

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
      // 녹음이 끝나면 듣기 모드(무음 모드·백그라운드 재생)로 되돌림
      await setAudioModeAsync(PLAYBACK_AUDIO_MODE);
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
    const controller = new AbortController();
    uploadAbort.current = controller;
    if (attachment) setProgress(0);
    send.mutate(
      { body, attachment, replyToMessageId: quoteId, onProgress: setProgress, signal: controller.signal },
      {
        onSuccess: () => {
          setDraft('');
          setAttachment(null);
          if (quoteId) clearQuote();
        },
        onError: (error) =>
          setNotice(
            error instanceof UploadCancelledError
              ? { text: t('studio.uploadCancelled'), error: false }
              : { text: t('studio.sendFailed'), error: true },
          ),
        onSettled: () => {
          setProgress(null);
          uploadAbort.current = null;
        },
      },
    );
  };

  const canSend = !send.isPending && !recorderState.isRecording && (!!draft.trim() || !!attachment);
  const visible = messages?.filter((message) => !message.deletedAt || message.deletedByAdmin) ?? [];

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <SafeAreaView style={styles.inner} edges={['bottom']}>
        {isLoading ? (
          <ActivityIndicator style={styles.loading} color={theme.tint} />
        ) : (
          <FlatList
            inverted
            // 내가 지운 메시지는 안 보임(운영자가 가린 건 이유와 함께 보임)
            data={visible}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.flip}>
                <EmptyState icon={Send} title={t('studio.emptyTitle')} body={t('studio.empty')} />
              </View>
            }
            renderItem={({ item }) => (
              <MyMessage message={item} onOpenReplies={() => router.push(`/studio/${actorId}/replies/${item.id}`)} onDelete={() => void removeMessage(item.id)} />
            )}
          />
        )}

        {notice && (
          <Pressable onPress={() => setNotice(null)} style={[styles.toast, { backgroundColor: notice.error ? theme.danger : theme.primary }]}>
            <ThemedText type="small" style={{ color: notice.error ? '#ffffff' : theme.onPrimary, textAlign: 'center' }}>
              {notice.text}
            </ThemedText>
          </Pressable>
        )}

        {quoteId && (
          <View style={[styles.tray, { backgroundColor: theme.tintSoft }]}>
            <Icon as={CornerUpLeft} size={18} color={theme.tint} />
            <View style={styles.trayBody}>
              <ThemedText type="smallBold">{t('quote.replyTo', { nickname: quoteNickname ?? '' })}</ThemedText>
              {quoteBody ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {quoteBody}
                </ThemedText>
              ) : null}
              <ThemedText type="caption" themeColor="textSecondary">
                {t('quote.publicNotice')}
              </ThemedText>
            </View>
            <IconButton icon={X} size={18} label={t('studio.cancelQuote')} onPress={clearQuote} />
          </View>
        )}

        {(attachment || recorderState.isRecording) && (
          <View style={[styles.tray, { backgroundColor: theme.backgroundElement }]}>
            {recorderState.isRecording ? (
              <>
                <View style={[styles.recDot, { backgroundColor: theme.danger }]} />
                <ThemedText type="smallBold" style={styles.trayBody}>
                  {t('studio.recording', { seconds: Math.floor(recorderState.durationMillis / 1000) })}
                </ThemedText>
              </>
            ) : attachment ? (
              <>
                {attachment.mediaType === 'PHOTO' ? (
                  <Image source={{ uri: attachment.uri }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbIcon, { backgroundColor: theme.background }]}>
                    <Icon as={attachment.mediaType === 'VIDEO' ? Video : Mic} size={20} color={theme.tint} />
                  </View>
                )}
                <View style={styles.trayBody}>
                  <ThemedText type="smallMedium">{t(`studio.attached.${attachment.mediaType}`)}</ThemedText>
                  {progress !== null ? (
                    <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                      <View style={[styles.progressFill, { backgroundColor: theme.tint, width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                  ) : null}
                  {progress !== null ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      {t('studio.uploading', { percent: Math.round(progress * 100) })}
                    </ThemedText>
                  ) : null}
                </View>
                {send.isPending ? (
                  <IconButton icon={X} size={18} label={t('studio.cancelUpload')} onPress={() => uploadAbort.current?.abort()} />
                ) : (
                  <IconButton icon={X} size={18} label={t('studio.removeAttachment')} onPress={() => setAttachment(null)} />
                )}
              </>
            ) : null}
          </View>
        )}

        <View style={styles.tools}>
          <IconButton icon={ImagePlus} label={t('studio.attachLibrary')} onPress={pickFromLibrary} color={recorderState.isRecording ? theme.textTertiary : theme.text} />
          {Platform.OS !== 'web' && (
            <IconButton icon={Camera} label={t('studio.camera')} onPress={takeWithCamera} color={recorderState.isRecording ? theme.textTertiary : theme.text} />
          )}
          <IconButton
            icon={recorderState.isRecording ? Square : Mic}
            label={recorderState.isRecording ? t('studio.stopRecordingShort') : t('studio.record')}
            onPress={() => void toggleRecording()}
            color={recorderState.isRecording ? theme.danger : theme.text}
          />
          {/* 받는 팬마다 그 팬의 닉네임으로 바뀌는 자리 — 버블처럼 "OO야" 하고 부를 때 */}
          <Pressable
            onPress={() => setDraft((current) => `${current}${NAME_TOKEN}`)}
            accessibilityRole="button"
            accessibilityHint={t('studio.insertNameHint')}
            style={[styles.nameChip, { backgroundColor: theme.backgroundElement }]}>
            <Icon as={AtSign} size={15} color={theme.tint} />
            <ThemedText type="smallMedium">{t('studio.insertName')}</ThemedText>
          </Pressable>
        </View>
        {draft.includes(NAME_TOKEN) && (
          <ThemedText type="caption" themeColor="textSecondary" style={styles.nameHint}>
            {t('studio.insertNameHint')}
          </ThemedText>
        )}

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('studio.inputPlaceholder')}
            placeholderTextColor={theme.textTertiary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }, fontFor(400, i18n.language)]}
            multiline
            numberOfLines={1}
            maxLength={1000}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={t('studio.send')}
            style={[styles.sendButton, { backgroundColor: canSend ? theme.tint : theme.backgroundElement }]}>
            {send.isPending ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Icon as={ArrowUp} size={20} strokeWidth={2.25} color={canSend ? '#ffffff' : theme.textTertiary} />
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, maxWidth: 240 },
  loading: { marginTop: Spacing.six },
  list: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: Spacing.four },
  flip: { transform: [{ scaleY: -1 }] },
  messageRow: { alignItems: 'flex-end', gap: 6 },
  column: { maxWidth: '80%', alignItems: 'flex-end', gap: 4 },
  hidden: { opacity: 0.45 },
  bubble: { borderRadius: Radius.lg + 2, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  metaButton: { width: 28, height: 28 },
  toast: { position: 'absolute', top: Spacing.three, alignSelf: 'center', maxWidth: '86%', borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, zIndex: 10 },
  tray: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginHorizontal: Spacing.three, marginBottom: Spacing.two, borderRadius: Radius.md, padding: Spacing.two, paddingLeft: Spacing.three },
  trayBody: { flex: 1, gap: 3 },
  thumb: { width: 44, height: 44, borderRadius: Radius.sm },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two },
  nameChip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: Spacing.three - 4, borderRadius: Radius.pill, marginLeft: Spacing.one },
  nameHint: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.one },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, paddingTop: Spacing.one },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: Spacing.three, paddingTop: 11, paddingBottom: 11, fontSize: 15, outlineStyle: 'none' } as object,
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
