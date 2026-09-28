import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FanReplyActions } from '@/components/fan-reply-actions';
import { useMessageReplies, useStudioMessages } from '@/hooks/use-studio';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 스타 메시지 하나에 달린 팬 답장 모아보기(버블처럼 "말풍선 하나당 답장방 하나").
// 팬 답장은 서버가 "보낸 시점의 최신 스타 메시지"로 자동으로 묶어둠.
export default function MessageRepliesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { actorId, messageId } = useLocalSearchParams<{ actorId: string; messageId: string }>();
  const { data: messages } = useStudioMessages(actorId);
  const { data: replies, isLoading } = useMessageReplies(actorId, messageId);
  const original = messages?.find((message) => message.id === messageId);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {original && (
        <ThemedView type="tintSoft" style={styles.original}>
          {original.mediaType !== 'TEXT' && (
            <ThemedText type="smallBold">{t(`studio.media.${original.mediaType}`)}</ThemedText>
          )}
          {original.body && <ThemedText type="small">{original.body}</ThemedText>}
        </ThemedView>
      )}
      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : (
        <FlatList
          data={replies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Pressable onPress={() => router.push(`/blocks/${actorId}`)} hitSlop={8} style={styles.blocksLink}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('block.manage')} ›
              </ThemedText>
            </Pressable>
          }
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {t('studio.repliesEmpty')}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ThemedView style={[styles.reply, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{item.fanUser ? `${item.fanUser.nickname ?? t('console.noNickname')} ${item.fanUser.tag}` : t('console.deletedFan')}</ThemedText>
              <ThemedText type="small">{item.body}</ThemedText>
              <ThemedView style={styles.replyFooter}>
                <ThemedText type="small" themeColor="textSecondary">
                  {new Date(item.createdAt).toLocaleString(i18n.language)}
                </ThemedText>
                {item.fanUser && (
                  <FanReplyActions
                    actorId={actorId}
                    messageId={item.id}
                    fanUserId={item.fanUser.id}
                    nickname={item.fanUser.nickname ?? ''}
                  />
                )}
                {item.fanUser && (
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      // 새 화면을 쌓지 않고 아래에 있던 스튜디오 화면으로 돌아가면서 인용 정보를 넘김
                      router.dismissTo({
                        pathname: '/studio/[actorId]',
                        params: {
                          actorId,
                          quoteId: item.id,
                          quoteNickname: item.fanUser?.nickname ?? '',
                          quoteBody: (item.body ?? '').slice(0, 120),
                        },
                      })
                    }>
                    <ThemedText type="smallBold" style={{ color: theme.tint }}>
                      ↩ {t('quote.action')}
                    </ThemedText>
                  </Pressable>
                )}
              </ThemedView>
            </ThemedView>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  original: { margin: Spacing.three, marginBottom: 0, borderRadius: 14, padding: Spacing.three, gap: 4 },
  loading: { marginTop: Spacing.six },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.four },
  reply: { borderRadius: 12, padding: Spacing.three, gap: 2 },
  blocksLink: { alignSelf: 'flex-end' },
  replyFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'transparent' },
});
