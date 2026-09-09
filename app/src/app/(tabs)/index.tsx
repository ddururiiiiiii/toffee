import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActors, type Actor } from '@/hooks/use-actors';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

function formatPrice(cents: number) {
  return `฿${(cents / 100).toFixed(0)}/월`;
}

function ActorCard({ actor, onPress }: { actor: Actor; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Image
        source={{ uri: actor.officialProfileImageUrl ?? undefined }}
        style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}
      />
      <ThemedView style={styles.cardBody}>
        <ThemedText type="smallBold">{actor.legalName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatPrice(actor.monthlyPriceCents)}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function ActorListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data: actors, isLoading, isError, refetch, isRefetching } = useActors(query);

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          배우 찾기
        </ThemedText>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="배우 이름으로 검색"
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </ThemedView>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : isError ? (
        <ThemedText style={styles.centerMessage} themeColor="danger">
          배우 목록을 불러오지 못했어요.
        </ThemedText>
      ) : (
        <FlatList
          data={actors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <ThemedText style={styles.centerMessage} themeColor="textSecondary">
              검색 결과가 없어요.
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ActorCard actor={item} onPress={() => router.push(`/actor/${item.id}`)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three },
  title: { fontSize: 32, lineHeight: 40 },
  search: { borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: Spacing.three, gap: Spacing.three },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  cardBody: { gap: 2 },
  loading: { marginTop: Spacing.six },
  centerMessage: { textAlign: 'center', marginTop: Spacing.six },
});
