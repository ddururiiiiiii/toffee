import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useAdminAgencies,
  useAdminUsers,
  useAssignStaffAgency,
  useChangeUserRole,
  useSuspendUser,
  useBanUser,
  useReactivateUser,
  type AdminUser,
  type AssignableRole,
  type SanctionCategory,
} from '@/hooks/use-admin';
import { AdminChip, AdminMessage } from '@/components/admin-ui';
import { ApiError } from '@/lib/api-client';
import { confirm } from '@/lib/confirm';
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

const ROLE_LABELS: Record<AdminUser['role'], string> = {
  USER: '팬',
  ACTOR: '아티스트',
  AGENCY_STAFF: '소속사 직원',
  ADMIN: '운영자',
};
const ASSIGNABLE: AssignableRole[] = ['USER', 'ACTOR', 'AGENCY_STAFF'];

// 스타·소속사 직원도 일반 가입(소셜 로그인)으로 들어온 뒤 여기서 역할을 바꿈. 운영자 계정은 대상 아님(서버에서도 막음)
function RoleControls({ user }: { user: AdminUser }) {
  const changeRole = useChangeUserRole();
  const assignAgency = useAssignStaffAgency();
  const { data: agencies } = useAdminAgencies();
  const [message, setMessage] = useState<string | null>(null);
  const busy = changeRole.isPending || assignAgency.isPending;
  const onError = (e: unknown) => setMessage(e instanceof ApiError ? e.message : '바꾸지 못했어요.');

  const pickRole = async (role: AssignableRole) => {
    if (role === user.role) return;
    const detail =
      user.role === 'ACTOR' && user.actorSelf
        ? `\n${user.actorSelf.legalName} 아티스트 본인 계정 연결이 해제돼요.`
        : user.role === 'AGENCY_STAFF' && user.agency
          ? `\n${user.agency.name} 소속사 배정이 해제돼요.`
          : '';
    const ok = await confirm('역할 변경', `${user.displayName} 계정을 "${ROLE_LABELS[role]}"(으)로 바꿀까요?${detail}`, '변경', '취소');
    if (ok) {
      setMessage(null);
      changeRole.mutate({ id: user.id, role }, { onError });
    }
  };

  return (
    <ThemedView style={styles.roleBox}>
      <ThemedView style={styles.actions}>
        {ASSIGNABLE.map((role) => (
          <AdminChip key={role} label={ROLE_LABELS[role]} selected={user.role === role} disabled={busy} onPress={() => pickRole(role)} />
        ))}
      </ThemedView>
      {user.role === 'AGENCY_STAFF' && (
        <ThemedView style={styles.actions}>
          <AdminChip
            label="소속사 없음"
            selected={!user.agency}
            disabled={busy}
            onPress={() => assignAgency.mutate({ id: user.id, agencyId: null }, { onError })}
          />
          {agencies?.map((agency) => (
            <AdminChip
              key={agency.id}
              label={agency.name}
              selected={user.agency?.id === agency.id}
              disabled={busy}
              onPress={() => assignAgency.mutate({ id: user.id, agencyId: agency.id }, { onError })}
            />
          ))}
        </ThemedView>
      )}
      <AdminMessage text={message} error />
    </ThemedView>
  );
}

// 제재 사유 분류 — 신고 사유와 같은 5가지. 당사자에게는 분류만 번역해서 안내되고, 메모는 운영자만 봄
const SANCTION_LABELS: Record<SanctionCategory, string> = {
  SPAM: '스팸·광고',
  ABUSE: '욕설·괴롭힘',
  SEXUAL: '음란·성적',
  PRIVACY: '개인정보 노출',
  OTHER: '기타',
};

function UserRow({ user }: { user: AdminUser }) {
  const theme = useTheme();
  const suspend = useSuspendUser();
  const ban = useBanUser();
  const reactivate = useReactivateUser();
  const isPending = suspend.isPending || ban.isPending || reactivate.isPending;
  const [category, setCategory] = useState<SanctionCategory | null>(null);
  const [note, setNote] = useState('');

  const handleSuspend = (days: number) => {
    if (!category) return;
    suspend.mutate({ id: user.id, until: suspendUntilIso(days), category, note });
  };

  return (
    <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedView style={styles.rowHeader}>
        <ThemedText type="smallBold">
          {user.displayName}
          {user.nickname ? ` (${user.nickname})` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor={user.status === 'ACTIVE' && !user.deletedAt ? 'textSecondary' : 'danger'}>
          {user.deletedAt ? `탈퇴 (${new Date(user.deletedAt).toLocaleDateString('ko-KR')})` : statusLabel(user.status)}
        </ThemedText>
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        {user.email ?? '이메일 없음'} · {ROLE_LABELS[user.role]}
        {user.agency ? ` · ${user.agency.name}` : ''}
        {user.actorSelf ? ` · ${user.actorSelf.legalName} 본인` : ''}
      </ThemedText>
      {user.role !== 'ADMIN' && !user.deletedAt && <RoleControls user={user} />}
      {user.status === 'SUSPENDED' && user.suspendedUntil && (
        <ThemedText type="small" themeColor="textSecondary">
          해제: {new Date(user.suspendedUntil).toLocaleString('ko-KR')}
        </ThemedText>
      )}
      {user.status !== 'ACTIVE' && user.sanctionCategory && (
        <ThemedText type="small" themeColor="textSecondary">
          사유: {SANCTION_LABELS[user.sanctionCategory]}
          {user.sanctionNote ? ` — ${user.sanctionNote}` : ''}
        </ThemedText>
      )}

      {/* 정지·영구차단은 사유 분류를 먼저 골라야 함(작업 기록·당사자 안내용) */}
      <ThemedView style={styles.actions}>
        {(Object.keys(SANCTION_LABELS) as SanctionCategory[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setCategory(category === key ? null : key)}
            style={[styles.actionChip, { borderColor: category === key ? theme.tint : theme.backgroundSelected, backgroundColor: category === key ? theme.tintSoft : 'transparent' }]}>
            <ThemedText type="small">{SANCTION_LABELS[key]}</ThemedText>
          </Pressable>
        ))}
      </ThemedView>
      {category && (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="내부 메모(선택, 당사자에게 안 보임)"
          placeholderTextColor={theme.textSecondary}
          maxLength={500}
          style={[styles.noteInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
      )}
      <ThemedView style={styles.actions}>
        {SUSPEND_DURATIONS_DAYS.map((days) => (
          <Pressable
            key={days}
            disabled={isPending || !category}
            onPress={() => handleSuspend(days)}
            style={[styles.actionChip, { borderColor: theme.backgroundSelected }]}>
            <ThemedText type="small">{days}일 정지</ThemedText>
          </Pressable>
        ))}
        <Pressable
          disabled={isPending || !category}
          onPress={() => category && ban.mutate({ id: user.id, category, note })}
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
          placeholder="이름·닉네임·이메일로 검색"
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
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two, backgroundColor: 'transparent' },
  roleBox: { backgroundColor: 'transparent' },
  actionChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 6 },
  reactivateChipText: { color: '#fff' },
  noteInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 14 },
  emptyMessage: { textAlign: 'center', marginTop: Spacing.six },
  loading: { marginTop: Spacing.six },
});
