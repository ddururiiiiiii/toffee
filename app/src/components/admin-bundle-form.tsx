import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, formatBaht, parseBahtToCents } from '@/components/admin-ui';
import { useAdminActors, type AdminBundle, type BundleInput } from '@/hooks/use-admin';
import { Spacing } from '@/constants/theme';
import { STORE_PRODUCT_ID_PATTERN } from '@/utils/store-product';

/**
 * 묶음 등록·수정 공통 폼(운영자) — 이름, 묶음 가격, 포함 배우(2명 이상), 스토어 상품 ID. 구독 중인 팬이 있는 묶음은 배우
 * 구성을 못 바꿈(이미 산 팬의 방이 갑자기 바뀌면 안 돼서 — 판매 중지 후 새 묶음으로).
 */
export function AdminBundleForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
}: {
  initial?: AdminBundle;
  submitLabel: string;
  pending: boolean;
  onSubmit: (input: Required<Pick<BundleInput, 'name' | 'priceCents'>> & BundleInput, done: (error?: string) => void) => void;
}) {
  const [query, setQuery] = useState('');
  const { data: actors } = useAdminActors(query.trim());
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? String(initial.priceCents / 100) : '');
  const [productId, setProductId] = useState(initial?.storeProductId ?? '');
  const [selected, setSelected] = useState<{ id: string; name: string; priceCents: number }[]>(
    initial?.actors.map((actor) => ({ id: actor.id, name: actor.legalName, priceCents: actor.monthlyPriceCents })) ?? [],
  );
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const locked = (initial?.activePurchaseCount ?? 0) > 0;
  const regular = selected.reduce((sum, actor) => sum + actor.priceCents, 0);
  const priceCents = parseBahtToCents(price);

  const toggle = (actor: { id: string; legalName: string; monthlyPriceCents: number }) =>
    setSelected((list) =>
      list.some((item) => item.id === actor.id)
        ? list.filter((item) => item.id !== actor.id)
        : [...list, { id: actor.id, name: actor.legalName, priceCents: actor.monthlyPriceCents }],
    );

  const submit = () => {
    const storeProductId = productId.trim() || null;
    if (!name.trim()) return setMessage({ text: '묶음 이름을 입력해 주세요.', error: true });
    if (priceCents === null) return setMessage({ text: '묶음 가격을 숫자로 입력해 주세요(예: 179).', error: true });
    if (selected.length < 2) return setMessage({ text: '아티스트를 2명 이상 골라 주세요.', error: true });
    if (storeProductId && !STORE_PRODUCT_ID_PATTERN.test(storeProductId)) {
      return setMessage({ text: '스토어 상품 ID는 소문자·숫자·_·. 만 쓸 수 있어요(예: toffee.bundle.nawin_pakin).', error: true });
    }
    setMessage(null);
    const actorIds = selected.map((actor) => actor.id);
    const actorsChanged = !initial || actorIds.slice().sort().join() !== initial.actors.map((actor) => actor.id).sort().join();
    onSubmit({ name: name.trim(), priceCents, storeProductId, ...(actorsChanged ? { actorIds } : {}) }, (error) =>
      setMessage(error ? { text: error, error: true } : { text: '저장했어요.' }),
    );
  };

  return (
    <>
      <AdminSection title="묶음 정보" hint="묶음 가격은 앱에 보이는 금액이에요 — 실제 결제 금액은 스토어에 등록한 상품 가격이 기준이라 같이 맞춰야 해요.">
        <AdminField label="묶음 이름(팬에게 보여요)" value={name} onChangeText={setName} maxLength={60} placeholder="예: Nawin + Pakin" />
        <AdminField label="묶음 월 가격(바트)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="예: 179" />
        {selected.length >= 2 && priceCents !== null ? (
          <ThemedText type="small" themeColor="textSecondary">
            개인 구독 합계 {formatBaht(regular)} → 묶음 {formatBaht(priceCents)}
            {regular > 0 ? ` (${Math.round((1 - priceCents / regular) * 100)}% 할인)` : ''}
          </ThemedText>
        ) : null}
        <AdminField
          label="스토어 상품 ID(등록 전엔 비워 두기)"
          value={productId}
          onChangeText={setProductId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="예: toffee.bundle.nawin_pakin"
          maxLength={100}
        />
      </AdminSection>

      <AdminSection
        title={`포함 아티스트 (${selected.length}명)`}
        hint={locked ? `구독 중인 팬이 ${initial?.activePurchaseCount}명 있어서 아티스트 구성은 바꿀 수 없어요. 판매 중지 후 새 묶음을 만들어 주세요.` : '2명 이상 골라 주세요. 정산은 개인 구독 정가 비율로 나눠 기록돼요.'}>
        <ThemedView style={styles.chips}>
          {selected.map((actor) => (
            <AdminChip key={actor.id} label={`✓ ${actor.name}`} selected disabled={locked} onPress={() => toggle({ id: actor.id, legalName: actor.name, monthlyPriceCents: actor.priceCents })} />
          ))}
        </ThemedView>
        {locked ? null : (
          <>
            <AdminField label="아티스트 검색" value={query} onChangeText={setQuery} placeholder="이름·소속사" autoCapitalize="none" />
            <ThemedView style={styles.chips}>
              {actors
                ?.filter((actor) => !actor.retiredAt && !selected.some((item) => item.id === actor.id))
                .map((actor) => (
                  <AdminChip key={actor.id} label={`${actor.legalName} · ${formatBaht(actor.monthlyPriceCents)}`} onPress={() => toggle(actor)} />
                ))}
            </ThemedView>
          </>
        )}
      </AdminSection>

      <AdminMessage text={message?.text ?? null} error={message?.error} />
      <AdminButton label={pending ? '저장 중…' : submitLabel} disabled={pending} onPress={submit} />
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, backgroundColor: 'transparent' },
});
