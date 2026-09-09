import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ApiError } from '@/lib/api-client';
import { useActor } from '@/hooks/use-actors';
import { useMySubscriptions, useSubscribe } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

function formatPrice(cents: number) {
  return `฿${(cents / 100).toFixed(0)}`;
}

export default function ActorDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: actor, isLoading } = useActor(id);
  const { data: subscriptions } = useMySubscriptions();
  const subscribe = useSubscribe(id);
  const [discountNote, setDiscountNote] = useState<string | null>(null);

  const isSubscribed = subscriptions?.some((sub) => sub.actorId === id) ?? false;

  const handleSubscribe = () => {
    subscribe.mutate(undefined, {
      onSuccess: (result) => {
        if (result.bundleDiscountApplied) {
          setDiscountNote(
            `함께 구독 중인 배우가 있어서 ${formatPrice(result.basePriceCents)} → ${formatPrice(result.effectivePriceCents)}로 할인 적용됐어요.`,
          );
        } else {
          router.push(`/chat/${id}`);
        }
      },
    });
  };

  if (isLoading || !actor) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.content}>
        <Image
          source={{ uri: actor.officialProfileImageUrl ?? undefined }}
          style={[styles.photo, { backgroundColor: theme.backgroundSelected }]}
        />
        <ThemedText type="title" style={styles.name}>
          {actor.legalName}
        </ThemedText>
        <ThemedText themeColor="textSecondary">월 {formatPrice(actor.monthlyPriceCents)} (샌드박스 결제 — 실제 청구 없음)</ThemedText>

        {discountNote && (
          <ThemedView type="tintSoft" style={styles.discountNote}>
            <ThemedText type="small">{discountNote}</ThemedText>
          </ThemedView>
        )}

        {subscribe.isError && (
          <ThemedText themeColor="danger" type="small">
            {subscribe.error instanceof ApiError ? subscribe.error.message : '구독에 실패했어요.'}
          </ThemedText>
        )}

        {isSubscribed ? (
          <Pressable
            onPress={() => router.push(`/chat/${id}`)}
            style={[styles.button, { backgroundColor: theme.tint }]}>
            <ThemedText style={styles.buttonText}>대화하기</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSubscribe}
            disabled={subscribe.isPending}
            style={[styles.button, { backgroundColor: theme.tint, opacity: subscribe.isPending ? 0.6 : 1 }]}>
            {subscribe.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>구독하기</ThemedText>
            )}
          </Pressable>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.four, paddingTop: Spacing.five, gap: Spacing.three },
  photo: { width: 200, height: 260, borderRadius: 20 },
  name: { fontSize: 28, lineHeight: 34 },
  discountNote: { borderRadius: 12, padding: Spacing.three, alignSelf: 'stretch' },
  button: { alignSelf: 'stretch', borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.three },
  buttonText: { color: '#fff', fontWeight: '600' },
  loading: { marginTop: Spacing.six },
});
