import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActor } from '@/hooks/use-actors';
import { useActorStats, useActorReplies, useSendBroadcast, type FanReply } from '@/hooks/use-console';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

type Section = 'broadcast' | 'replies' | 'stats';
type MediaType = 'TEXT' | 'PHOTO' | 'AUDIO';

function SegmentedControl({ value, onChange }: { value: Section; onChange: (section: Section) => void }) {
  const theme = useTheme();
  const options: { key: Section; label: string }[] = [
    { key: 'broadcast', label: '발송' },
    { key: 'replies', label: '답장' },
    { key: 'stats', label: '통계' },
  ];
  return (
    <ThemedView style={[styles.segments, { backgroundColor: theme.backgroundElement }]}>
      {options.map((opt) => (
        <Pressable
          key={opt.key}
          onPress={() => onChange(opt.key)}
          style={[styles.segment, value === opt.key && { backgroundColor: theme.tint }]}>
          <ThemedText type="smallBold" style={value === opt.key ? styles.segmentTextActive : undefined}>
            {opt.label}
          </ThemedText>
        </Pressable>
      ))}
    </ThemedView>
  );
}

function BroadcastSection({ actorId }: { actorId: string }) {
  const theme = useTheme();
  const [mediaType, setMediaType] = useState<MediaType>('TEXT');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const sendBroadcast = useSendBroadcast(actorId);

  const canSend = mediaType === 'TEXT' ? body.trim().length > 0 : mediaUrl.trim().length > 0;

  const handleSend = () => {
    sendBroadcast.mutate(
      { mediaType, body: body.trim() || undefined, mediaUrl: mediaType === 'TEXT' ? undefined : mediaUrl.trim() },
      { onSuccess: () => { setBody(''); setMediaUrl(''); } },
    );
  };

  return (
    <ThemedView style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary">
        구독 중인 모든 팬에게 전송돼요. 본문에 <ThemedText type="code">{'{{name}}'}</ThemedText>를 넣으면 각 팬 본인의
        닉네임으로 자동 치환돼요.
      </ThemedText>

      <ThemedView style={[styles.segments, styles.mediaTypeRow, { backgroundColor: theme.backgroundElement }]}>
        {(['TEXT', 'PHOTO', 'AUDIO'] as MediaType[]).map((type) => (
          <Pressable
            key={type}
            onPress={() => setMediaType(type)}
            style={[styles.segment, mediaType === type && { backgroundColor: theme.tint }]}>
            <ThemedText type="small" style={mediaType === type ? styles.segmentTextActive : undefined}>
              {type === 'TEXT' ? '텍스트' : type === 'PHOTO' ? '사진' : '음성'}
            </ThemedText>
          </Pressable>
        ))}
      </ThemedView>

      {mediaType !== 'TEXT' && (
        <TextInput
          value={mediaUrl}
          onChangeText={setMediaUrl}
          placeholder={mediaType === 'PHOTO' ? '이미지 URL' : '음성 파일 URL'}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      )}

      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder={mediaType === 'TEXT' ? '메시지 내용' : '캡션 (선택)'}
        placeholderTextColor={theme.textSecondary}
        multiline
        style={[styles.input, styles.textArea, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      <Pressable onPress={() => setBody((prev) => `${prev}{{name}}`)} style={styles.insertNameButton}>
        <ThemedText type="small" themeColor="tint">
          + 이름 변수 삽입
        </ThemedText>
      </Pressable>

      <Pressable
        onPress={handleSend}
        disabled={!canSend || sendBroadcast.isPending}
        style={[styles.sendButton, { backgroundColor: theme.tint, opacity: canSend ? 1 : 0.5 }]}>
        {sendBroadcast.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.sendButtonText}>구독자 전체에게 보내기</ThemedText>
        )}
      </Pressable>
      {sendBroadcast.isSuccess && (
        <ThemedText type="small" themeColor="textSecondary">
          발송했어요!
        </ThemedText>
      )}
    </ThemedView>
  );
}

function ReplyRow({ reply }: { reply: FanReply }) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.replyRow, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{reply.fanUser?.displayName ?? '탈퇴한 팬'}</ThemedText>
      <ThemedText type="small">{reply.body}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {new Date(reply.createdAt).toLocaleString('ko-KR')}
      </ThemedText>
    </ThemedView>
  );
}

function RepliesSection({ actorId }: { actorId: string }) {
  const theme = useTheme();
  const { data: replies, isLoading } = useActorReplies(actorId);

  if (isLoading) return <ActivityIndicator style={styles.loading} color={theme.tint} />;

  return (
    <FlatList
      data={replies}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.repliesList}
      ListEmptyComponent={
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyMessage}>
          아직 팬 답장이 없어요.
        </ThemedText>
      }
      renderItem={({ item }) => <ReplyRow reply={item} />}
    />
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="title" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

function StatsSection({ actorId }: { actorId: string }) {
  const theme = useTheme();
  const { data: stats, isLoading } = useActorStats(actorId);

  if (isLoading || !stats) return <ActivityIndicator style={styles.loading} color={theme.tint} />;

  return (
    <ThemedView style={styles.section}>
      <StatCard label="활성 구독자 수" value={String(stats.subscriberCount)} />
      <StatCard
        label="마지막 발송일"
        value={stats.lastBroadcastAt ? new Date(stats.lastBroadcastAt).toLocaleDateString('ko-KR') : '발송 이력 없음'}
      />
    </ThemedView>
  );
}

export default function ConsoleActorScreen() {
  const navigation = useNavigation();
  const { actorId } = useLocalSearchParams<{ actorId: string }>();
  const { data: actor } = useActor(actorId);
  const [section, setSection] = useState<Section>('broadcast');

  useEffect(() => {
    if (actor) navigation.setOptions({ title: actor.chatDisplayName });
  }, [actor, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SegmentedControl value={section} onChange={setSection} />
      {actor && (
        <ThemedView style={styles.actorPreview}>
          <Image
            source={{ uri: actor.chatProfileImageUrl ?? undefined }}
            style={styles.actorPreviewAvatar}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {actor.legalName}로 발행 중
          </ThemedText>
        </ThemedView>
      )}
      {section === 'broadcast' && <BroadcastSection actorId={actorId} />}
      {section === 'replies' && <RepliesSection actorId={actorId} />}
      {section === 'stats' && <StatsSection actorId={actorId} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segments: { flexDirection: 'row', margin: Spacing.four, borderRadius: 10, padding: 4, gap: 4 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 8 },
  segmentTextActive: { color: '#fff' },
  actorPreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four, marginBottom: Spacing.two },
  actorPreviewAvatar: { width: 24, height: 24, borderRadius: 12 },
  section: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  mediaTypeRow: { margin: 0 },
  input: { borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  insertNameButton: { alignSelf: 'flex-start' },
  sendButton: { borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center' },
  sendButtonText: { color: '#fff', fontWeight: '600' },
  repliesList: { padding: Spacing.four, gap: Spacing.three },
  replyRow: { borderRadius: 12, padding: Spacing.three, gap: 4 },
  emptyMessage: { textAlign: 'center', marginTop: Spacing.four },
  loading: { marginTop: Spacing.six },
  statCard: { borderRadius: 14, padding: Spacing.four, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 36, lineHeight: 42 },
});
