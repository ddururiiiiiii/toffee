import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, parseBahtToCents } from '@/components/admin-ui';
import { useAdminActors, useCreateCouple } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';

/**
 * 커플방 만들기(2026-09-29) — 1인 배우 2명 + 공식 이름·방 이름·월 가격. 공식 사진·스토어 상품 ID는 만든 뒤 상세 화면에서,
 * 방 이름·대화방 사진은 두 배우가 각자 스튜디오에서 바꿀 수 있음.
 */
export default function AdminNewCoupleScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data: actors } = useAdminActors(query.trim());
  const create = useCreateCouple();
  const [members, setMembers] = useState<{ id: string; name: string; chatName: string }[]>([]);
  const [legalName, setLegalName] = useState('');
  const [chatDisplayName, setChatDisplayName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (actor: { id: string; legalName: string; chatDisplayName: string }) => {
    setMembers((list) => {
      if (list.some((item) => item.id === actor.id)) return list.filter((item) => item.id !== actor.id);
      if (list.length >= 2) return list;
      const next = [...list, { id: actor.id, name: actor.legalName, chatName: actor.chatDisplayName }];
      // 두 명을 고르면 이름 칸을 기본값으로 채워 줌(비어 있을 때만)
      if (next.length === 2) {
        setLegalName((value) => value || `${next[0].name} & ${next[1].name}`);
        setChatDisplayName((value) => value || `${next[0].chatName} & ${next[1].chatName}`);
      }
      return next;
    });
  };

  const submit = () => {
    const monthlyPriceCents = parseBahtToCents(price);
    if (members.length !== 2) return setError('배우를 2명 골라 주세요.');
    if (!legalName.trim() || !chatDisplayName.trim()) return setError('공식 이름과 방 이름을 입력해 주세요.');
    if (monthlyPriceCents === null) return setError('월 구독료를 숫자로 입력해 주세요(예: 69).');
    setError(null);
    create.mutate(
      { memberIds: members.map((member) => member.id), legalName: legalName.trim(), chatDisplayName: chatDisplayName.trim(), monthlyPriceCents },
      {
        onSuccess: (room) => router.replace({ pathname: '/admin/actors/[id]', params: { id: (room as { id: string }).id } }),
        onError: (e) => setError(e instanceof ApiError ? e.message : '만들지 못했어요.'),
      },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AdminSection title={`멤버 배우 (${members.length}/2)`} hint="같은 두 배우의 커플방은 하나만 만들 수 있어요.">
          <ThemedView style={styles.chips}>
            {members.map((member) => (
              <AdminChip key={member.id} label={`✓ ${member.name}`} selected onPress={() => toggle({ id: member.id, legalName: member.name, chatDisplayName: member.chatName })} />
            ))}
          </ThemedView>
          <AdminField label="배우 검색" value={query} onChangeText={setQuery} placeholder="이름·소속사" autoCapitalize="none" />
          <ThemedView style={styles.chips}>
            {actors
              ?.filter((actor) => actor.kind !== 'COUPLE' && !actor.retiredAt && !members.some((member) => member.id === actor.id))
              .map((actor) => (
                <AdminChip key={actor.id} label={actor.legalName} disabled={members.length >= 2} onPress={() => toggle(actor)} />
              ))}
          </ThemedView>
        </AdminSection>
        <AdminSection title="기본 정보" hint="공식 이름은 배우 찾기·커플방 소개에, 방 이름은 채팅방 위에 보여요(방 이름은 두 배우가 나중에 바꿀 수 있어요).">
          <AdminField label="공식 이름" value={legalName} onChangeText={setLegalName} maxLength={100} />
          <AdminField label="방 이름" value={chatDisplayName} onChangeText={setChatDisplayName} maxLength={50} />
          <AdminField label="월 구독료(바트)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="예: 69" />
        </AdminSection>
        <AdminMessage text={error} error />
        <AdminButton label={create.isPending ? '만드는 중…' : '커플방 만들기'} disabled={create.isPending} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, backgroundColor: 'transparent' },
});
