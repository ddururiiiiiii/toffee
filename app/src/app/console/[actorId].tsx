import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ThemedText } from '@/components/themed-text';
import { ChatPhotoEditor } from '@/components/chat-photo-editor';
import { showNameToken } from '@/utils/name-token';
import { ThemedView } from '@/components/themed-view';
import { FanReplyActions } from '@/components/fan-reply-actions';
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

const MEDIA_TYPES = new Set(['PHOTO', 'AUDIO', 'VIDEO']);

function mediaLabel(t: TFunction, mediaType: string) {
  return t(`console.media.${MEDIA_TYPES.has(mediaType) ? mediaType : 'TEXT'}`);
}

function SegmentedControl({ value, onChange }: { value: Section; onChange: (section: Section) => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const options: { key: Section; label: string }[] = [
    { key: 'monitor', label: t('console.tabs.monitor') },
    { key: 'replies', label: t('console.tabs.replies') },
    { key: 'stats', label: t('console.tabs.stats') },
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
  | { kind: 'message'; id: string; mediaType: string; body: string | null; createdAt: string; removed: 'actor' | 'admin' | null }
  | { kind: 'story'; id: string; mediaType: string; createdAt: string };

// 소속사는 발송 권한이 없음 — 배우가 실제로 보낸 메시지/스토리를 읽기 전용으로만 확인
function MonitorSection({ actorId }: { actorId: string }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { data: broadcasts, isLoading: loadingBroadcasts } = useActorBroadcasts(actorId);
  const { data: stories, isLoading: loadingStories } = useActorStories(actorId);

  if (loadingBroadcasts || loadingStories) return <ActivityIndicator style={styles.loading} color={theme.tint} />;

  const items: MonitorItem[] = [
    ...(broadcasts ?? []).map(
      (m: ChatMessage): MonitorItem => ({
        kind: 'message',
        id: m.id,
        mediaType: m.mediaType,
        body: m.body,
        createdAt: m.createdAt,
        removed: m.deletedAt ? (m.deletedByAdmin ? 'admin' : 'actor') : null,
      }),
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
          {t('console.monitorEmpty')}
        </ThemedText>
      }
      renderItem={({ item }) => (
        <ThemedView style={[styles.replyRow, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">
            {t(`console.kind.${item.kind}`)} · {mediaLabel(t, item.mediaType)}
          </ThemedText>
          {/* 모니터링 기록이라 지워진 메시지도 표시(팬에게는 안 보임) */}
          {item.kind === 'message' && item.removed && (
            <ThemedText type="small" themeColor="danger">
              {t(item.removed === 'admin' ? 'studio.hiddenByAdmin' : 'console.deletedByActor')}
            </ThemedText>
          )}
          {item.kind === 'message' && item.body && <ThemedText type="small">{showNameToken(item.body, t('studio.fanNickname'))}</ThemedText>}
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(item.createdAt).toLocaleString(i18n.language)}
          </ThemedText>
        </ThemedView>
      )}
    />
  );
}

function ReplyRow({ reply, actorId }: { reply: FanReply; actorId: string }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  return (
    <ThemedView style={[styles.replyRow, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{reply.fanUser ? `${reply.fanUser.nickname ?? t('console.noNickname')} ${reply.fanUser.tag}` : t('console.deletedFan')}</ThemedText>
      <ThemedText type="small">{reply.body}</ThemedText>
      <ThemedView style={styles.replyFooter}>
        <ThemedText type="small" themeColor="textSecondary">
          {new Date(reply.createdAt).toLocaleString(i18n.language)}
        </ThemedText>
        {reply.fanUser && (
          <FanReplyActions
            actorId={actorId}
            messageId={reply.id}
            fanUserId={reply.fanUser.id}
            nickname={reply.fanUser.nickname ?? ''}
          />
        )}
      </ThemedView>
    </ThemedView>
  );
}

function RepliesSection({ actorId }: { actorId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: replies, isLoading } = useActorReplies(actorId);

  if (isLoading) return <ActivityIndicator style={styles.loading} color={theme.tint} />;

  return (
    <FlatList
      data={replies}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.repliesList}
      ListEmptyComponent={
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyMessage}>
          {t('console.repliesEmpty')}
        </ThemedText>
      }
      ListHeaderComponent={
        <Pressable onPress={() => router.push(`/blocks/${actorId}`)} hitSlop={8} style={styles.blocksLink}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('block.manage')} ›
          </ThemedText>
        </Pressable>
      }
      renderItem={({ item }) => <ReplyRow reply={item} actorId={actorId} />}
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
  const { t, i18n } = useTranslation();
  const { data: stats, isLoading } = useActorStats(actorId);

  if (isLoading || !stats) return <ActivityIndicator style={styles.loading} color={theme.tint} />;

  return (
    <ThemedView style={styles.section}>
      <StatCard label={t('console.activeSubscribers')} value={String(stats.subscriberCount)} />
      <StatCard
        label={t('console.lastBroadcast')}
        value={
          stats.lastBroadcastAt
            ? new Date(stats.lastBroadcastAt).toLocaleDateString(i18n.language)
            : t('console.noBroadcast')
        }
      />
    </ThemedView>
  );
}

export default function ConsoleActorScreen() {
  const { t } = useTranslation();
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
          <ThemedView style={styles.actorPreviewBody}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('console.monitoring', { name: actor.legalName })}
            </ThemedText>
            <ChatPhotoEditor actorId={actor.id} hasPhoto={!!actor.chatProfileImageUrl} />
          </ThemedView>
        </ThemedView>
      )}
      {section === 'monitor' && <MonitorSection actorId={actorId} />}
      {section === 'replies' && <RepliesSection actorId={actorId} />}
      {section === 'stats' && <StatsSection actorId={actorId} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actorPreviewBody: { flex: 1, gap: 4, backgroundColor: 'transparent' },
  replyFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' },
  blocksLink: { alignSelf: 'flex-end' },
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
