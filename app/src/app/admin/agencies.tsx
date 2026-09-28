import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AdminAvatar, AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, pickSquarePhoto } from '@/components/admin-ui';
import { useAdminAgencies, useCreateAgency, useUpdateAgency, type AdminAgency } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { confirm } from '@/lib/confirm';
import { uploadProfileImage } from '@/lib/upload-media';
import { Spacing } from '@/constants/theme';

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function AgencyRow({ agency }: { agency: AdminAgency }) {
  const theme = useTheme();
  const updateAgency = useUpdateAgency();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(agency.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const saveName = () => {
    if (!name.trim()) return setMessage('이름을 입력해 주세요.');
    updateAgency.mutate(
      { id: agency.id, name: name.trim() },
      { onSuccess: () => setEditing(false), onError: (e) => setMessage(errorText(e, '저장하지 못했어요.')) },
    );
  };

  const changeLogo = async () => {
    const picked = await pickSquarePhoto();
    if (!picked) return;
    setBusy(true);
    setMessage(null);
    try {
      const key = await uploadProfileImage('AGENCY', agency.id, picked.uri, picked.contentType);
      await updateAgency.mutateAsync({ id: agency.id, logoUrl: key });
    } catch (e) {
      setMessage(errorText(e, '로고를 올리지 못했어요.'));
    } finally {
      setBusy(false);
    }
  };

  const removeLogo = async () => {
    if (await confirm('로고 삭제', `${agency.name} 로고를 지울까요?`, '삭제', '취소')) {
      updateAgency.mutate({ id: agency.id, logoUrl: null }, { onError: (e) => setMessage(errorText(e, '삭제하지 못했어요.')) });
    }
  };

  return (
    <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedView style={styles.rowHeader}>
        <AdminAvatar uri={agency.logoUrl} name={agency.name} />
        <ThemedView style={styles.rowBody}>
          <ThemedText type="smallBold">{agency.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            배우 {agency.actorCount}명 · 직원 {agency.staffCount}명
          </ThemedText>
        </ThemedView>
      </ThemedView>
      {editing ? (
        <>
          <AdminField label="소속사 이름" value={name} onChangeText={setName} maxLength={100} />
          <ThemedView style={styles.chips}>
            <AdminChip label="저장" selected disabled={updateAgency.isPending} onPress={saveName} />
            <AdminChip label="취소" onPress={() => (setEditing(false), setName(agency.name))} />
          </ThemedView>
        </>
      ) : (
        <ThemedView style={styles.chips}>
          <AdminChip label="이름 바꾸기" onPress={() => setEditing(true)} />
          <AdminChip label={busy ? '올리는 중…' : agency.logoUrl ? '로고 바꾸기' : '로고 올리기'} disabled={busy} onPress={changeLogo} />
          {agency.logoUrl ? <AdminChip label="로고 삭제" danger disabled={busy} onPress={removeLogo} /> : null}
        </ThemedView>
      )}
      <AdminMessage text={message} error />
    </ThemedView>
  );
}

export default function AdminAgenciesScreen() {
  const theme = useTheme();
  const { data: agencies, isLoading } = useAdminAgencies();
  const createAgency = useCreateAgency();
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const create = () => {
    if (!name.trim()) return;
    createAgency.mutate(name.trim(), {
      onSuccess: () => (setName(''), setMessage(null)),
      onError: (e) => setMessage(errorText(e, '등록하지 못했어요.')),
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : (
        <FlatList
          data={agencies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <AdminSection
              title="소속사 등록"
              hint="로고는 등록한 뒤에 올릴 수 있어요. 직원 배정은 회원 관리에서, 배우 소속은 배우 관리에서 해요.">
              <AdminField label="소속사 이름" value={name} onChangeText={setName} maxLength={100} onSubmitEditing={create} />
              <AdminMessage text={message} error />
              <AdminButton label="등록" disabled={createAgency.isPending || !name.trim()} onPress={create} />
            </AdminSection>
          }
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              등록된 소속사가 없어요.
            </ThemedText>
          }
          renderItem={({ item }) => <AgencyRow agency={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, backgroundColor: 'transparent' },
  rowBody: { flex: 1, gap: 2, backgroundColor: 'transparent' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, backgroundColor: 'transparent' },
  empty: { textAlign: 'center', marginTop: Spacing.six },
  loading: { marginTop: Spacing.six },
});
