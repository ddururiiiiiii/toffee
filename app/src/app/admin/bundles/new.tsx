import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { AdminBundleForm } from '@/components/admin-bundle-form';
import { useCreateBundle } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';

export default function AdminNewBundleScreen() {
  const router = useRouter();
  const create = useCreateBundle();
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AdminBundleForm
          submitLabel="등록"
          pending={create.isPending}
          onSubmit={(input, done) =>
            create.mutate(
              { ...input, actorIds: input.actorIds ?? [] },
              {
                onSuccess: (bundle) => router.replace({ pathname: '/admin/bundles/[id]', params: { id: bundle.id } }),
                onError: (e) => done(e instanceof ApiError ? e.message : '등록하지 못했어요.'),
              },
            )
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
});
