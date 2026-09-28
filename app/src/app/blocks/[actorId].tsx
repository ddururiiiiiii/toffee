import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useChannelBlocks, useUnblockFan } from '@/hooks/use-safety';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 이 배우 채널에서 차단한 팬 목록(배우 본인·소속사 공용) — 해제하면 다시 답장할 수 있음
export default function ChannelBlocksScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { actorId } = useLocalSearchParams<{ actorId: string }>();
  const { data: blocks, isLoading } = useChannelBlocks(actorId);
  const unblock = useUnblockFan(actorId);

  if (isLoading) return <ActivityIndicator style={styles.loading} color={theme.tint} />;
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={blocks}
        keyExtractor={(item) => item.fanUser.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <ThemedText type="small" themeColor="textSecondary">
            {t('block.listHint')}
          </ThemedText>
        }
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {t('block.empty')}
          </ThemedText>
        }
        renderItem={({ item }) => (
          <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <ThemedView style={styles.rowBody}>
              <ThemedText type="smallBold">
                {item.fanUser.nickname ?? t('console.noNickname')} {item.fanUser.tag}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(item.createdAt).toLocaleDateString(i18n.language)}
              </ThemedText>
            </ThemedView>
            <Pressable onPress={() => unblock.mutate(item.fanUser.id)} disabled={unblock.isPending} hitSlop={8}>
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                {t('block.unblock')}
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  list: { padding: Spacing.four, gap: Spacing.three },
  empty: { textAlign: 'center', marginTop: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: Spacing.three },
  rowBody: { flex: 1, gap: 2, backgroundColor: 'transparent' },
});
