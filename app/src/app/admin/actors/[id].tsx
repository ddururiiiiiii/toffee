import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  AdminAvatar,
  AdminButton,
  AdminChip,
  AdminField,
  AdminMessage,
  AdminSection,
  formatBaht,
  parseBahtToCents,
  pickSquarePhoto,
} from '@/components/admin-ui';
import {
  useActorAgencyHistory,
  useAdminActor,
  useAdminAgencies,
  useAdminUsers,
  useAssignActorAgency,
  useLinkActorUser,
  useSetActorRetired,
  useUpdateActor,
  useUpdateActorImages,
  type AdminActor,
} from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { confirm } from '@/lib/confirm';
import { uploadProfileImage } from '@/lib/upload-media';
import { Spacing } from '@/constants/theme';

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR');
}

type ImageField = 'officialProfileImageKey' | 'chatProfileImageKey';

function PhotoSlot({ actor, field, label }: { actor: AdminActor; field: ImageField; label: string }) {
  const updateImages = useUpdateActorImages(actor.id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const uri = field === 'officialProfileImageKey' ? actor.officialProfileImageUrl : actor.chatProfileImageUrl;

  const change = async () => {
    const picked = await pickSquarePhoto();
    if (!picked) return;
    setBusy(true);
    setMessage(null);
    try {
      const key = await uploadProfileImage('ACTOR', actor.id, picked.uri, picked.contentType);
      await updateImages.mutateAsync({ [field]: key });
    } catch (e) {
      setMessage(errorText(e, '사진을 올리지 못했어요.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm(`${label} 삭제`, '사진을 지우면 이름 첫 글자로 표시돼요.', '삭제', '취소'))) return;
    updateImages.mutate({ [field]: null }, { onError: (e) => setMessage(errorText(e, '삭제하지 못했어요.')) });
  };

  return (
    <ThemedView style={styles.photoSlot}>
      <AdminAvatar uri={uri} name={actor.legalName} size={88} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedView style={styles.chips}>
        <AdminChip label={busy ? '올리는 중…' : uri ? '바꾸기' : '올리기'} disabled={busy} onPress={change} />
        {uri ? <AdminChip label="삭제" danger disabled={busy} onPress={remove} /> : null}
      </ThemedView>
      <AdminMessage text={message} error />
    </ThemedView>
  );
}

function BasicInfo({ actor }: { actor: AdminActor }) {
  const updateActor = useUpdateActor(actor.id);
  const [legalName, setLegalName] = useState(actor.legalName);
  const [chatDisplayName, setChatDisplayName] = useState(actor.chatDisplayName);
  const [price, setPrice] = useState(String(actor.monthlyPriceCents / 100));
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const save = () => {
    const monthlyPriceCents = parseBahtToCents(price);
    if (!legalName.trim() || !chatDisplayName.trim()) return setMessage({ text: '이름을 비울 수 없어요.', error: true });
    if (monthlyPriceCents === null) return setMessage({ text: '월 구독료를 숫자로 입력해 주세요.', error: true });
    updateActor.mutate(
      { legalName: legalName.trim(), chatDisplayName: chatDisplayName.trim(), monthlyPriceCents },
      {
        onSuccess: () => setMessage({ text: '저장했어요.' }),
        onError: (e) => setMessage({ text: errorText(e, '저장하지 못했어요.'), error: true }),
      },
    );
  };

  return (
    <AdminSection
      title="기본 정보"
      hint="구독료는 앱에 보이는 금액이에요 — 실제 결제 금액은 스토어에 등록한 상품 가격이 기준이라 같이 바꿔야 해요.">
      <AdminField label="공식 이름(실명·활동명)" value={legalName} onChangeText={setLegalName} maxLength={100} />
      <AdminField label="닉네임(배우가 직접 바꿀 수 있음)" value={chatDisplayName} onChangeText={setChatDisplayName} maxLength={20} />
      <AdminField label="월 구독료(바트)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <ThemedView style={styles.chips}>
        <AdminChip
          label={actor.verified ? '✓ 공식 인증됨' : '공식 인증 안 됨'}
          selected={actor.verified}
          disabled={updateActor.isPending}
          onPress={() => updateActor.mutate({ verified: !actor.verified })}
        />
      </ThemedView>
      <AdminMessage text={message?.text ?? null} error={message?.error} />
      <AdminButton label={updateActor.isPending ? '저장 중…' : '저장'} disabled={updateActor.isPending} onPress={save} />
    </AdminSection>
  );
}

function AgencySection({ actor }: { actor: AdminActor }) {
  const { data: agencies } = useAdminAgencies();
  const { data: history } = useActorAgencyHistory(actor.id);
  const assign = useAssignActorAgency(actor.id);
  const [message, setMessage] = useState<string | null>(null);
  const currentId = actor.agency?.id ?? null;

  const move = async (agencyId: string | null, name: string) => {
    if (agencyId === currentId) return;
    const ok = await confirm(
      '소속사 변경',
      `${actor.legalName} 배우를 "${name}"(으)로 옮길까요?\n이전 소속사는 이 배우의 메시지를 더 이상 볼 수 없고, 이적 기록이 남아요.`,
      '변경',
      '취소',
    );
    if (ok) assign.mutate(agencyId, { onError: (e) => setMessage(errorText(e, '변경하지 못했어요.')) });
  };

  return (
    <AdminSection title="소속사" hint="이적 기록은 정산·계약 확인용으로 남아요.">
      <ThemedView style={styles.chips}>
        <AdminChip label="무소속" selected={currentId === null} disabled={assign.isPending} onPress={() => move(null, '무소속')} />
        {agencies?.map((agency) => (
          <AdminChip
            key={agency.id}
            label={agency.name}
            selected={currentId === agency.id}
            disabled={assign.isPending}
            onPress={() => move(agency.id, agency.name)}
          />
        ))}
      </ThemedView>
      <AdminMessage text={message} error />
      {history && history.length > 0 ? (
        <ThemedView style={styles.history}>
          {history.map((entry) => (
            <ThemedText key={entry.id} type="small" themeColor="textSecondary">
              {entry.agency.name} · {formatDate(entry.startedAt)} ~ {entry.endedAt ? formatDate(entry.endedAt) : '현재'}
            </ThemedText>
          ))}
        </ThemedView>
      ) : null}
    </AdminSection>
  );
}

function SelfAccountSection({ actor }: { actor: AdminActor }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const { data: candidates } = useAdminUsers(query.trim(), 'ACTOR');
  const link = useLinkActorUser(actor.id);
  const [message, setMessage] = useState<string | null>(null);
  const onError = (e: unknown) => setMessage(errorText(e, '연결하지 못했어요.'));

  const unlink = async () => {
    if (await confirm('본인 계정 연결 해제', '해제하면 그 계정으로 메시지를 보낼 수 없어요.', '해제', '취소')) {
      link.mutate(null, { onError });
    }
  };

  return (
    <AdminSection
      title="본인 계정"
      hint="연결된 계정으로 로그인하면 스튜디오에서 이 배우로 메시지를 보내요. 회원 관리에서 역할을 '배우'로 바꾼 계정만 나와요.">
      {actor.selfUser ? (
        <ThemedView style={styles.linkedRow}>
          <ThemedText type="small" style={styles.flex}>
            {actor.selfUser.displayName} · {actor.selfUser.email ?? '이메일 없음'}
          </ThemedText>
          <AdminChip label="연결 해제" danger disabled={link.isPending} onPress={unlink} />
        </ThemedView>
      ) : (
        <>
          <AdminField label="배우 계정 검색" value={query} onChangeText={setQuery} placeholder="이름 또는 이메일" />
          {candidates?.length ? (
            candidates.map((user) => (
              <ThemedView key={user.id} style={[styles.linkedRow, { borderColor: theme.backgroundSelected }]}>
                <ThemedText type="small" style={styles.flex}>
                  {user.displayName} · {user.email ?? '이메일 없음'}
                  {user.actorSelf ? ` (${user.actorSelf.legalName}에 연결됨)` : ''}
                </ThemedText>
                <AdminChip
                  label="연결"
                  disabled={link.isPending || !!user.actorSelf}
                  onPress={() => link.mutate(user.id, { onError })}
                />
              </ThemedView>
            ))
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              배우 역할 계정이 없어요.
            </ThemedText>
          )}
        </>
      )}
      <AdminMessage text={message} error />
    </AdminSection>
  );
}

// 활동 종료(계약 종료 등) — 둘러보기·검색에서 숨기고 신규 구독을 막음. 기존 구독 팬은 대화 유지(잠정 정책). 작업 기록에 남음
function RetireSection({ actor }: { actor: AdminActor }) {
  const setRetired = useSetActorRetired(actor.id);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const toggle = async () => {
    const retiring = !actor.retiredAt;
    const ok = await confirm(
      retiring ? '활동 종료' : '활동 재개',
      retiring
        ? `${actor.legalName} 배우를 둘러보기·검색에서 숨기고 신규 구독을 막을까요?\n\n지금 구독 중인 팬(${actor.activeSubscriberCount}명)은 대화를 계속 볼 수 있어요. 스토어 결제가 붙으면 스토어 상품 판매도 같이 멈춰야 갱신이 안 돼요.`
        : `${actor.legalName} 배우를 다시 둘러보기에 보이고 구독을 받을까요?`,
      retiring ? '활동 종료' : '활동 재개',
      '취소',
    );
    if (!ok) return;
    setRetired.mutate(retiring, {
      onSuccess: () => setMessage({ text: retiring ? '활동을 종료했어요.' : '활동을 재개했어요.' }),
      onError: (e) => setMessage({ text: errorText(e, '바꾸지 못했어요.'), error: true }),
    });
  };
  return (
    <AdminSection title="활동 상태" hint="계약이 끝나거나 활동을 멈출 때. 기존 구독 팬의 대화는 그대로 남아요.">
      <ThemedText type="small" themeColor={actor.retiredAt ? 'danger' : 'textSecondary'}>
        {actor.retiredAt ? `활동 종료됨 (${formatDate(actor.retiredAt)})` : '활동 중'}
      </ThemedText>
      <AdminMessage text={message?.text ?? null} error={message?.error} />
      <AdminButton
        label={setRetired.isPending ? '바꾸는 중…' : actor.retiredAt ? '활동 재개' : '활동 종료'}
        disabled={setRetired.isPending}
        onPress={() => void toggle()}
      />
    </AdminSection>
  );
}

export default function AdminActorDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: actor, isLoading } = useAdminActor(id);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: actor?.legalName ?? '배우' }} />
      {isLoading || !actor ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatBaht(actor.monthlyPriceCents)}/월 · 구독자 {actor.activeSubscriberCount}명 · 등록 {formatDate(actor.createdAt)}
          </ThemedText>
          <AdminSection title="프로필 사진" hint="공식 사진은 배우 찾기·배우 소개에, 대화방 사진은 채팅방에서 보여요. 정사각으로 잘라서 올려요.">
            <ThemedView style={styles.photos}>
              <PhotoSlot actor={actor} field="officialProfileImageKey" label="공식 사진" />
              <PhotoSlot actor={actor} field="chatProfileImageKey" label="대화방 사진" />
            </ThemedView>
          </AdminSection>
          <BasicInfo key={`${actor.id}-info`} actor={actor} />
          <AgencySection actor={actor} />
          <SelfAccountSection actor={actor} />
          <RetireSection actor={actor} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  loading: { marginTop: Spacing.six },
  photos: { flexDirection: 'row', gap: Spacing.four, backgroundColor: 'transparent' },
  photoSlot: { alignItems: 'center', gap: Spacing.one, backgroundColor: 'transparent', flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, backgroundColor: 'transparent' },
  history: { gap: 2, backgroundColor: 'transparent' },
  linkedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, backgroundColor: 'transparent' },
  flex: { flex: 1 },
});
