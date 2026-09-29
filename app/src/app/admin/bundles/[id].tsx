import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { AdminBundleForm } from '@/components/admin-bundle-form';
import { AdminChip, AdminSection } from '@/components/admin-ui';
import { useAdminBundle, useUpdateBundle } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api-client';
import { confirm } from '@/lib/confirm';
import { Spacing } from '@/constants/theme';

export default function AdminBundleScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: bundle } = useAdminBundle(id);
  const update = useUpdateBundle(id);

  if (!bundle) return <ActivityIndicator style={styles.loading} color={theme.tint} />;

  // 판매 중지: 새로 살 수 없게만(이미 산 팬은 유지) — 스토어 결제가 붙으면 스토어 상품 판매도 같이 멈춰야 갱신이 안 됨
  const toggleActive = async () => {
    if (bundle.active && !(await confirm('판매 중지', '새로 살 수 없게 돼요. 이미 구독 중인 팬은 그대로 이용해요.', '판매 중지', '취소'))) return;
    update.mutate({ active: !bundle.active });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: bundle.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <AdminSection title="판매 상태" hint={`지금 구독 중인 팬 ${bundle.activePurchaseCount}명`}>
          <ThemedView style={styles.chips}>
            <AdminChip label={bundle.active ? '판매 중' : '판매 중지됨'} selected={bundle.active} disabled={update.isPending} onPress={() => void toggleActive()} />
          </ThemedView>
        </AdminSection>
        <AdminBundleForm
          key={`${bundle.id}-${bundle.activePurchaseCount}`}
          initial={bundle}
          submitLabel="저장"
          pending={update.isPending}
          onSubmit={(input, done) =>
            update.mutate(input, {
              onSuccess: () => done(),
              onError: (e) => done(e instanceof ApiError ? e.message : '저장하지 못했어요.'),
            })
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, backgroundColor: 'transparent' },
  loading: { marginTop: Spacing.six },
});
