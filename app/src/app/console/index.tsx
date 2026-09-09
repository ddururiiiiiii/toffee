import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMyActors } from '@/hooks/use-console';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import type { Actor } from '@/hooks/use-actors';

function ActorRow({ actor, onPress }: { actor: Actor; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <Image
        source={{ uri: actor.chatProfileImageUrl ?? undefined }}
        style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}
      />
      <ThemedView style={styles.rowBody}>
        <ThemedText type="smallBold">{actor.chatDisplayName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {actor.legalName}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function ConsoleHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = useAuth();
  const { data: actors, isLoading } = useMyActors();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ThemedText type="smallBold" style={styles.sectionLabel}>
        내가 관리하는 배우
      </ThemedText>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : (
        <FlatList
          data={actors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyMessage}>
              담당 중인 배우가 없어요.
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ActorRow actor={item} onPress={() => router.push(`/console/${item.id}`)} />
          )}
        />
      )}

      <Pressable onPress={logout} style={[styles.logoutButton, { borderColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold" themeColor="danger">
          로그아웃
        </ThemedText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionLabel: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: Spacing.three, gap: Spacing.three },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  rowBody: { gap: 2 },
  emptyMessage: { textAlign: 'center', marginTop: Spacing.four },
  loading: { marginTop: Spacing.four },
  logoutButton: {
    margin: Spacing.four,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
