import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { useMyActors } from '@/hooks/use-console';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { Spacing } from '@/constants/theme';

// 배우 본인 계정의 첫 화면 — 배우 본인은 보통 채널이 하나라 바로 그 채널로 이동(운영자가 들어오면 목록)
export default function StudioHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { role, logout } = useAuth();
  const { data: actors, isLoading } = useMyActors();

  useEffect(() => {
    if (role === 'ACTOR' && actors?.length === 1) router.replace(`/studio/${actors[0].id}`);
  }, [role, actors, router]);

  if (isLoading || (role === 'ACTOR' && actors?.length === 1)) {
    return <ActivityIndicator style={styles.loading} color={theme.tint} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={actors}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <ThemedText type="small" themeColor="textSecondary">
            {t('studio.pickActor')}
          </ThemedText>
        }
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {t('studio.noActor')}
          </ThemedText>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/studio/${item.id}`)}
            style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <Image
              source={{ uri: item.chatProfileImageUrl ?? undefined }}
              style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}
            />
            <ThemedText type="smallBold" style={styles.flex}>
              {item.chatDisplayName}
            </ThemedText>
            {/* 개인방·커플방이 둘 다 있는 배우가 헷갈리지 않게 */}
            <ThemedText type="caption" themeColor="textSecondary">
              {item.kind === 'COUPLE' ? t('couple.roomLabel') : t('couple.soloLabel')}
            </ThemedText>
          </Pressable>
        )}
      />
      <Pressable onPress={logout} style={[styles.logout, { borderColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold" themeColor="danger">
          {t('common.logout')}
        </ThemedText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  flex: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.three },
  empty: { textAlign: 'center', marginTop: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: 14, padding: Spacing.three },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  logout: { margin: Spacing.four, borderWidth: 1, borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center' },
});
