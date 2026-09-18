import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActor } from '@/hooks/use-actors';
import {
  useActorStats,
  useActorReplies,
  useActorBroadcasts,
  useActorStories,
  type FanReply,
  type ActorStory,
} from '@/hooks/use-console';
import type { ChatMessage } from '@/hooks/use-messages';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

type Section = 'monitor' | 'replies' | 'stats';

function mediaLabel(mediaType: string) {
  switch (mediaType) {
    case 'PHOTO':
      return '사진';
    case 'AUDIO':
      return '음성';
    case 'VIDEO':
      return '영상';
    default:
      return '텍스트';
  }
}

function SegmentedControl({ value, onChange }: { value: Section; onChange: (section: Section) => void }) {
  const theme = useTheme();
  const options: { key: Section; label: string }[] = [
    { key: 'monitor', label: '모니터링' },
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

type MonitorItem =
  | { kind: 'message'; id: string; mediaType: string; body: string | null; createdAt: string }
  | { kind: 'story'; id: string; mediaType: string; createdAt: string };

// 소속사는 발송 권한이 없음 — 배우가 실제로 보낸 메시지/스토리를 읽기 전용으로만 확인
function MonitorSection({ actorId }: { actorId: string }) {
  const theme = useTheme();
  const { data: broadcasts, isLoading: loadingBroadcasts } = useActorBroadcasts(actorId);
  const { data: stories, isLoading: loadingStories } = useActorStories(actorId);

  if (loadingBroadcasts || loadingStories) return <ActivityIndicator style={styles.loading} color={theme.tint} />;

  const items: MonitorItem[] = [
    ...(broadcasts ?? []).map(
      (m: ChatMessage): MonitorItem => ({ kind: 'message', id: m.id, mediaType: m.mediaType, body: m.body, createdAt: m.createdAt }),
    ),
    ...(stories ?? []).map(
      (s: ActorStory): MonitorItem => ({ kind: 'story', id: s.id, mediaType: s.mediaType, createdAt: s.createdAt }),
    ),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => `${item.kind}-${item.id}`}
      contentContainerStyle={styles.repliesList}
      ListEmptyComponent={
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyMessage}>
          아직 배우가 보낸 메시지·스토리가 없어요.
        </ThemedText>
      }
      renderItem={({ item }) => (
        <ThemedView style={[styles.replyRow, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">
            {item.kind === 'story' ? '스토리' : '메시지'} · {mediaLabel(item.mediaType)}
          </ThemedText>
          {item.kind === 'message' && item.body && <ThemedText type="small">{item.body}</ThemedText>}
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(item.createdAt).toLocaleString('ko-KR')}
          </ThemedText>
        </ThemedView>
      )}
    />
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
  const [section, setSection] = useState<Section>('monitor');

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
            {actor.legalName} 모니터링 중
          </ThemedText>
        </ThemedView>
      )}
      {section === 'monitor' && <MonitorSection actorId={actorId} />}
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
  repliesList: { padding: Spacing.four, gap: Spacing.three },
  replyRow: { borderRadius: 12, padding: Spacing.three, gap: 4 },
  emptyMessage: { textAlign: 'center', marginTop: Spacing.four },
  loading: { marginTop: Spacing.six },
  statCard: { borderRadius: 14, padding: Spacing.four, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 36, lineHeight: 42 },
});
