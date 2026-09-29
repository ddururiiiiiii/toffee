import { ActivityIndicator, FlatList, Image, Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMyActors } from '@/hooks/use-console';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import type { Actor } from '@/hooks/use-actors';
import { useWideLayout } from '@/components/wide-shell';

function ActorRow({ actor, onPress }: { actor: Actor; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <Image
        source={{ uri: actor.chatProfileImageUrl ?? undefined }}
        style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}
      />
      <ThemedView style={styles.rowBody}>
        <ThemedText type="smallBold">{actor.chatDisplayName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {actor.kind === 'COUPLE' ? `${t('couple.roomLabel')} · ${actor.legalName}` : actor.legalName}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function ConsoleHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { data: actors, isLoading } = useMyActors();
  // 정산은 PC 웹 전용 — 넓은 화면에선 왼쪽 메뉴에 있어서 여기엔 좁은 웹 창일 때만
  const wide = useWideLayout();
  const showSettlementLink = Platform.OS === 'web' && !wide;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {showSettlementLink ? (
        <Pressable onPress={() => router.push('/console/settlements')} style={[styles.row, styles.settlementLink, { backgroundColor: theme.backgroundElement }]}>
          <ThemedView style={styles.rowBody}>
            <ThemedText type="smallBold">{t('settlement.title')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('settlement.menuHint')}
            </ThemedText>
          </ThemedView>
        </Pressable>
      ) : null}
      <ThemedText type="smallBold" style={styles.sectionLabel}>
        {t('console.title')}
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
              {t('console.empty')}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ActorRow actor={item} onPress={() => router.push(`/console/${item.id}`)} />
          )}
        />
      )}

      <Pressable onPress={logout} style={[styles.logoutButton, { borderColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold" themeColor="danger">
          {t('common.logout')}
        </ThemedText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  settlementLink: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
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
