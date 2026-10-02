import { useEffect, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import type { TFunction } from 'i18next';
import { BellOff, ChevronRight, CloudOff, Image as ImageIcon, MessageCircle, Mic, Search, Video, type LucideIcon } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { CountBadge } from '@/components/ui/badge';
import { BrandHeader } from '@/components/ui/brand-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { useMySubscriptions, type Subscription } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { setAppBadgeCount } from '@/lib/push';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { formatInboxTime } from '@/utils/relative-time';

const MEDIA_ICON: Partial<Record<string, LucideIcon>> = { PHOTO: ImageIcon, AUDIO: Mic, VIDEO: Video };
const MEDIA_TEXT: Partial<Record<string, string>> = { PHOTO: 'inbox.sentPhoto', AUDIO: 'inbox.sentVoice', VIDEO: 'inbox.sentVideo' };
const JUST_SENT: Record<string, string> = {
  PHOTO: 'inbox.justSentPhoto',
  AUDIO: 'inbox.justSentVoice',
  VIDEO: 'inbox.justSentVideo',
  TEXT: 'inbox.justSentMessage',
};

function previewText(sub: Subscription, t: TFunction): string {
  const last = sub.lastMessage;
  if (!last) return t('inbox.noMessagesYet');
  const text = last.body ?? (MEDIA_TEXT[last.mediaType] ? t(MEDIA_TEXT[last.mediaType]!) : '');
  return last.senderType === 'FAN' ? t('inbox.you', { text }) : text;
}

/**
 * Inbox — 시안 B3 Fandom Inbox(docs/product/brand/exploration/b3-fandom-inbox.png) + DESIGN_GUIDE §8.
 * "내 아티스트가 새로 뭘 보냈지?"의 설렘: 위에 가장 최근 새 소식 카드(안 읽은 아티스트 메시지 하나), 아래 대화 목록
 * 2026-10-02: 위쪽 구독 아티스트 동그라미 줄(안 읽음이면 링·점)은 뺌 — 링은 인스타처럼 "새 스토리" 뜻으로 2차 스토리 때 다시 씀(사용자 결정)
 * (마지막 메시지 미리보기·사진/음성/영상 힌트·시간·안 읽은 수). 최근 대화 순. 배지·강조색은 절제.
 */
export default function InboxScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { data: subscriptions, isLoading, isError, refetch, isRefetching } = useMySubscriptions({ live: true });
  const open = (sub: Subscription) => router.push(`/chat/${sub.actorId}`);

  const totalUnread = useMemo(() => (subscriptions ?? []).reduce((sum, s) => sum + s.unreadCount, 0), [subscriptions]);
  useEffect(() => {
    if (subscriptions) setAppBadgeCount(totalUnread);
  }, [subscriptions, totalUnread]);

  // 가장 최근의 안 읽은 새 소식 하나를 카드로
  const highlight = subscriptions?.find((s) => s.unreadCount > 0 && s.lastMessage?.senderType === 'ARTIST');

  const header = subscriptions && subscriptions.length > 0 ? (
    <View>
      {highlight && (
        <Pressable
          onPress={() => open(highlight)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.highlight, { backgroundColor: theme.tintSoft, opacity: pressed ? 0.9 : 1 }]}>
          {highlight.actor.chatProfileImageUrl ? (
            <Image source={{ uri: highlight.actor.chatProfileImageUrl }} style={styles.highlightPhoto} contentFit="cover" />
          ) : (
            <Avatar size={64} />
          )}
          <View style={styles.highlightBody}>
            <ThemedText type="headline" numberOfLines={1}>
              {highlight.actor.chatDisplayName}
            </ThemedText>
            <ThemedText type="smallMedium" numberOfLines={1} style={{ color: theme.tint }}>
              {t(JUST_SENT[highlight.lastMessage!.mediaType])}
            </ThemedText>
          </View>
          <Icon as={ChevronRight} size={20} color={theme.tint} />
        </Pressable>
      )}
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.inner}>
        <BrandHeader right={<IconButton icon={Search} label={t('inbox.search')} onPress={() => router.push('/')} />} />
        <FlatList
          data={subscriptions ?? []}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={theme.tint} />}
          renderItem={({ item }) => <InboxRow sub={item} onPress={() => open(item)} locale={i18n.language} />}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator style={styles.loading} color={theme.tint} />
            ) : isError ? (
              <EmptyState
                icon={CloudOff}
                title={t('inbox.loadFailed')}
                action={<Button title={t('discover.retry')} variant="secondary" onPress={() => void refetch()} />}
              />
            ) : (
              <EmptyState
                icon={MessageCircle}
                title={t('inbox.emptyTitle')}
                body={t('inbox.emptyBody')}
                action={<Button title={t('inbox.discover')} onPress={() => router.push('/')} />}
              />
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

function InboxRow({ sub, onPress, locale }: { sub: Subscription; onPress: () => void; locale: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const unread = sub.unreadCount > 0;
  const mediaIcon = sub.lastMessage && !sub.lastMessage.body ? MEDIA_ICON[sub.lastMessage.mediaType] : undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[sub.actor.chatDisplayName, previewText(sub, t), unread ? t('inbox.unread', { count: sub.unreadCount }) : '']
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundElement : 'transparent' }]}>
      <Avatar uri={sub.actor.chatProfileImageUrl} size={56} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={styles.nameLine}>
            <ThemedText type="headline" numberOfLines={1} style={styles.name}>
              {sub.actor.chatDisplayName}
            </ThemedText>
            {sub.notificationsMuted && <Icon as={BellOff} size={14} themeColor="textTertiary" accessibilityLabel={t('inbox.muted')} />}
          </View>
          {sub.lastMessage && (
            <ThemedText type="caption" style={{ color: unread ? theme.tint : theme.textTertiary }}>
              {formatInboxTime(sub.lastMessage.createdAt, locale, t)}
            </ThemedText>
          )}
        </View>
        <View style={styles.rowBottom}>
          <View style={styles.previewLine}>
            {mediaIcon && <Icon as={mediaIcon} size={15} color={unread ? theme.text : theme.textSecondary} />}
            <ThemedText
              type={unread ? 'smallMedium' : 'small'}
              numberOfLines={1}
              style={[styles.preview, { color: unread ? theme.text : theme.textSecondary }]}>
              {previewText(sub, t)}
            </ThemedText>
          </View>
          <CountBadge count={sub.unreadCount} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  list: { paddingBottom: Spacing.five },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.two + 2,
    borderRadius: Radius.lg,
  },
  highlightPhoto: { width: 76, height: 64, borderRadius: Radius.md },
  highlightBody: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four, paddingVertical: 10 },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  name: { flexShrink: 1 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  preview: { flex: 1 },
  loading: { marginTop: Spacing.six },
});
