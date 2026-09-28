import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ApiError } from '@/lib/api-client';
import { useActor } from '@/hooks/use-actors';
import { useMySubscriptions, useSubscribe } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

function formatPrice(t: TFunction, cents: number) {
  return t('price.amount', { price: (cents / 100).toFixed(0) });
}

export default function ActorDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
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
            t('actorDetail.discountApplied', {
              base: formatPrice(t, result.basePriceCents),
              effective: formatPrice(t, result.effectivePriceCents),
            }),
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
        {actor.agency && <ThemedText themeColor="textSecondary">{actor.agency.name}</ThemedText>}
        <ThemedText themeColor="textSecondary">
          {t('actorDetail.monthlyPrice', { price: formatPrice(t, actor.monthlyPriceCents) })}
        </ThemedText>

        {discountNote && (
          <ThemedView type="tintSoft" style={styles.discountNote}>
            <ThemedText type="small">{discountNote}</ThemedText>
          </ThemedView>
        )}

        {subscribe.isError && (
          <ThemedText themeColor="danger" type="small">
            {subscribe.error instanceof ApiError ? subscribe.error.message : t('actorDetail.subscribeFailed')}
          </ThemedText>
        )}

        {isSubscribed ? (
          <Pressable
            onPress={() => router.push(`/chat/${id}`)}
            style={[styles.button, { backgroundColor: theme.tint }]}>
            <ThemedText style={styles.buttonText}>{t('actorDetail.chat')}</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSubscribe}
            disabled={subscribe.isPending}
            style={[styles.button, { backgroundColor: theme.tint, opacity: subscribe.isPending ? 0.6 : 1 }]}>
            {subscribe.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>{t('actorDetail.subscribe')}</ThemedText>
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
