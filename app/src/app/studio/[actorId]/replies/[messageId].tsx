import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMessageReplies, useStudioMessages } from '@/hooks/use-studio';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 스타 메시지 하나에 달린 팬 답장 모아보기(버블처럼 "말풍선 하나당 답장방 하나").
// 팬 답장은 서버가 "보낸 시점의 최신 스타 메시지"로 자동으로 묶어둠.
export default function MessageRepliesScreen() {
  const theme = useTheme();
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
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {t('studio.repliesEmpty')}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ThemedView style={[styles.reply, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{item.fanUser ? `${item.fanUser.nickname ?? t('console.noNickname')} ${item.fanUser.tag}` : t('console.deletedFan')}</ThemedText>
              <ThemedText type="small">{item.body}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(item.createdAt).toLocaleString(i18n.language)}
              </ThemedText>
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
});
