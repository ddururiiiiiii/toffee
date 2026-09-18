import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useAdminUsers,
  useSuspendUser,
  useBanUser,
  useReactivateUser,
  type AdminUser,
} from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

const SUSPEND_DURATIONS_DAYS = [1, 3, 7];

function suspendUntilIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function statusLabel(status: AdminUser['status']) {
  switch (status) {
    case 'SUSPENDED':
      return '일시정지';
    case 'BANNED':
      return '영구차단';
    default:
      return '정상';
  }
}

function UserRow({ user }: { user: AdminUser }) {
  const theme = useTheme();
  const suspend = useSuspendUser();
  const ban = useBanUser();
  const reactivate = useReactivateUser();
  const isPending = suspend.isPending || ban.isPending || reactivate.isPending;

  const handleSuspend = (days: number) => {
    suspend.mutate({ id: user.id, until: suspendUntilIso(days) });
  };

  return (
    <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedView style={styles.rowHeader}>
        <ThemedText type="smallBold">{user.displayName}</ThemedText>
        <ThemedText type="small" themeColor={user.status === 'ACTIVE' ? 'textSecondary' : 'danger'}>
          {statusLabel(user.status)}
        </ThemedText>
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        {user.email ?? '이메일 없음'} · {user.role}
      </ThemedText>
      {user.status === 'SUSPENDED' && user.suspendedUntil && (
        <ThemedText type="small" themeColor="textSecondary">
          해제: {new Date(user.suspendedUntil).toLocaleString('ko-KR')}
        </ThemedText>
      )}

      <ThemedView style={styles.actions}>
        {SUSPEND_DURATIONS_DAYS.map((days) => (
          <Pressable
            key={days}
            disabled={isPending}
            onPress={() => handleSuspend(days)}
            style={[styles.actionChip, { borderColor: theme.backgroundSelected }]}>
            <ThemedText type="small">{days}일 정지</ThemedText>
          </Pressable>
        ))}
        <Pressable
          disabled={isPending}
          onPress={() => ban.mutate(user.id)}
          style={[styles.actionChip, { borderColor: theme.danger }]}>
          <ThemedText type="small" themeColor="danger">
            영구차단
          </ThemedText>
        </Pressable>
        {user.status !== 'ACTIVE' && (
          <Pressable
            disabled={isPending}
            onPress={() => reactivate.mutate(user.id)}
            style={[styles.actionChip, { backgroundColor: theme.tint, borderColor: theme.tint }]}>
            <ThemedText type="small" style={styles.reactivateChipText}>
              재활성화
            </ThemedText>
          </Pressable>
        )}
      </ThemedView>
    </ThemedView>
  );
}

export default function AdminUsersScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const { data: users, isLoading } = useAdminUsers(query);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ThemedView style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="이름 또는 이메일로 검색"
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </ThemedView>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyMessage}>
              회원이 없어요.
            </ThemedText>
          }
          renderItem={({ item }) => <UserRow user={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  search: { borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { borderRadius: 14, padding: Spacing.three, gap: 4 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  actionChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 6 },
  reactivateChipText: { color: '#fff' },
  emptyMessage: { textAlign: 'center', marginTop: Spacing.six },
  loading: { marginTop: Spacing.six },
});
