import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, parseBahtToCents } from '@/components/admin-ui';
import { useAdminAgencies, useCreateActor } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';

// 등록은 이름·가격·소속사만 — 사진·본인 계정 연결은 등록 후 상세 화면에서(업로드 경로에 배우 id가 필요)
export default function AdminNewActorScreen() {
  const router = useRouter();
  const { data: agencies } = useAdminAgencies();
  const createActor = useCreateActor();
  const [legalName, setLegalName] = useState('');
  const [chatDisplayName, setChatDisplayName] = useState('');
  const [price, setPrice] = useState('');
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const monthlyPriceCents = parseBahtToCents(price);
    if (!legalName.trim() || !chatDisplayName.trim()) return setError('공식 이름과 닉네임을 입력해 주세요.');
    if (monthlyPriceCents === null) return setError('월 구독료를 숫자로 입력해 주세요(예: 99).');
    setError(null);
    createActor.mutate(
      { legalName: legalName.trim(), chatDisplayName: chatDisplayName.trim(), monthlyPriceCents, agencyId: agencyId ?? undefined },
      {
        onSuccess: (actor) => router.replace({ pathname: '/admin/actors/[id]', params: { id: (actor as { id: string }).id } }),
        onError: (e) => setError(e instanceof ApiError ? e.message : '등록하지 못했어요.'),
      },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AdminSection title="기본 정보" hint="공식 이름은 배우 찾기 화면에, 닉네임은 채팅방 안에서 보여요. 닉네임과 대화방 사진은 배우가 나중에 직접 바꿀 수 있어요.">
          <AdminField label="공식 이름(실명·활동명)" value={legalName} onChangeText={setLegalName} maxLength={100} />
          <AdminField label="닉네임(배우가 직접 바꿀 수 있음)" value={chatDisplayName} onChangeText={setChatDisplayName} maxLength={20} />
          <AdminField
            label="월 구독료(바트)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="예: 99"
          />
        </AdminSection>

        <AdminSection title="소속사" hint="나중에 상세 화면에서 바꿀 수 있고, 바꾸면 이적 기록이 남아요.">
          <ThemedView style={styles.chips}>
            <AdminChip label="무소속" selected={agencyId === null} onPress={() => setAgencyId(null)} />
            {agencies?.map((agency) => (
              <AdminChip key={agency.id} label={agency.name} selected={agencyId === agency.id} onPress={() => setAgencyId(agency.id)} />
            ))}
          </ThemedView>
        </AdminSection>

        <AdminMessage text={error} error />
        <AdminButton label={createActor.isPending ? '등록 중…' : '등록'} disabled={createActor.isPending} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, backgroundColor: 'transparent' },
});
