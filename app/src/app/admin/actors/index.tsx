import { IDLE_WARN_DAYS, idleDays } from '@/utils/idle-days';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AdminAvatar, AdminButton, formatBaht } from '@/components/admin-ui';
import { useAdminActors, type AdminActor } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

function ActorRow({ actor }: { actor: AdminActor }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/admin/actors/[id]', params: { id: actor.id } })}
      style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <AdminAvatar uri={actor.officialProfileImageUrl ?? actor.chatProfileImageUrl} name={actor.legalName} />
      <ThemedView style={styles.rowBody}>
        <ThemedText type="smallBold">
          {actor.kind === 'COUPLE' ? '[커플방] ' : ''}
          {actor.legalName}
          {actor.verified ? ' ✓' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {actor.kind === 'COUPLE'
            ? `방 이름 ${actor.chatDisplayName} · 멤버 ${actor.coupleMembers.map(({ member }) => member.legalName).join(' + ')}`
            : `닉네임 ${actor.chatDisplayName} · ${actor.agency?.name ?? '무소속'}`}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatBaht(actor.monthlyPriceCents)}/월 · 구독자 {actor.activeSubscriberCount}명
          {actor.kind === 'COUPLE' ? '' : ` · ${actor.selfUser ? `본인 계정 ${actor.selfUser.displayName}` : '본인 계정 미연결'}`}
        </ThemedText>
        {/* 장기 미발송(2026-09-29) — 구독자가 있는데 오래 안 보냈으면 빨간색 */}
        {actor.activeSubscriberCount > 0 && !actor.retiredAt ? (
          <ThemedText type="small" themeColor={(idleDays(actor.lastBroadcastAt) ?? IDLE_WARN_DAYS) >= IDLE_WARN_DAYS ? 'danger' : 'textTertiary'}>
            {!actor.lastBroadcastAt ? '아직 보낸 메시지 없음' : idleDays(actor.lastBroadcastAt) === 0 ? '오늘 메시지 보냄' : `마지막 메시지 ${idleDays(actor.lastBroadcastAt)}일 전`}
          </ThemedText>
        ) : null}
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        ›
      </ThemedText>
    </Pressable>
  );
}

export default function AdminActorsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data: actors, isLoading } = useAdminActors(query.trim());

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ThemedView style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="배우 이름·닉네임·소속사로 검색"
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <AdminButton label="+ 배우 등록" onPress={() => router.push('/admin/actors/new')} />
        <AdminButton label="+ 커플방 만들기" onPress={() => router.push('/admin/actors/new-couple')} />
      </ThemedView>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : (
        <FlatList
          data={actors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {query ? '검색 결과가 없어요.' : '등록된 배우가 없어요.'}
            </ThemedText>
          }
          renderItem={({ item }) => <ActorRow actor={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.two },
  search: { borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { borderRadius: 14, padding: Spacing.three, gap: Spacing.three, flexDirection: 'row', alignItems: 'center' },
  rowBody: { flex: 1, gap: 2, backgroundColor: 'transparent' },
  empty: { textAlign: 'center', marginTop: Spacing.six },
  loading: { marginTop: Spacing.six },
});
