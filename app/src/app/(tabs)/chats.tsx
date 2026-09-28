import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMySubscriptions, type Subscription } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

function formatLastActive(sub: Subscription, t: TFunction, locale: string) {
  const latest = [sub.lastArtistMessageAt, sub.lastFanReplyAt].filter(Boolean).sort().at(-1);
  if (!latest) return t('chats.noConversation');
  return new Date(latest).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function ChatRow({ subscription, onPress }: { subscription: Subscription; onPress: () => void }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderBottomColor: theme.backgroundElement }]}>
      <Image
        source={{ uri: subscription.actor.chatProfileImageUrl ?? undefined }}
        style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}
      />
      <ThemedView style={styles.rowBody}>
        <ThemedText type="smallBold">{subscription.actor.chatDisplayName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatLastActive(subscription, t, i18n.language)}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function ChatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: subscriptions, isLoading, isError } = useMySubscriptions();

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {t('chats.title')}
      </ThemedText>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : isError ? (
        <ThemedText style={styles.centerMessage} themeColor="danger">
          {t('chats.loadFailed')}
        </ThemedText>
      ) : (
        <FlatList
          data={subscriptions}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <ThemedText style={styles.centerMessage} themeColor="textSecondary">
              {t('chats.empty')}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ChatRow subscription={item} onPress={() => router.push(`/chat/${item.actorId}`)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 32, lineHeight: 40, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  rowBody: { gap: 2 },
  loading: { marginTop: Spacing.six },
  centerMessage: { textAlign: 'center', marginTop: Spacing.six, paddingHorizontal: Spacing.four },
});
