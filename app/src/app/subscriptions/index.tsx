import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { useMySubscriptions, type Subscription } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { formatPrice } from '@/utils/price';

/** 구독 관리 — DESIGN_GUIDE §11: 여러 배우 구독을 세로 카드 목록으로(사진·이름·월 요금·상태), 누르면 상세 */
export default function ManageSubscriptionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: subscriptions, isLoading } = useMySubscriptions();

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={subscriptions ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <SubscriptionCard sub={item} onPress={() => router.push({ pathname: '/subscriptions/[actorId]', params: { actorId: item.actorId } })} />}
      ListEmptyComponent={
        isLoading ? (
          <ActivityIndicator style={styles.loading} color={theme.tint} />
        ) : (
          <EmptyState
            icon={Sparkles}
            title={t('profile.noSubscriptions')}
            action={<Button title={t('inbox.discover')} onPress={() => router.push('/')} />}
          />
        )
      }
    />
  );
}

function SubscriptionCard({ sub, onPress }: { sub: Subscription; onPress: () => void }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 }]}>
      <Avatar uri={sub.actor.chatProfileImageUrl} name={sub.actor.chatDisplayName} size={56} />
      <View style={styles.body}>
        <ThemedText type="headline" numberOfLines={1}>
          {sub.actor.chatDisplayName}
        </ThemedText>
        <ThemedText type="smallMedium">
          {formatPrice(t, sub.actor.monthlyPriceCents)} {t('actorProfile.perMonth')}
        </ThemedText>
        <ThemedText type="caption" themeColor="textTertiary">
          {t('manage.since', { date: new Date(sub.startedAt).toLocaleDateString(i18n.language) })}
        </ThemedText>
      </View>
      <View style={[styles.status, { backgroundColor: theme.tintSoft }]}>
        <ThemedText type="captionBold" style={{ color: theme.tint }}>
          {t('manage.active')}
        </ThemedText>
      </View>
      <Icon as={ChevronRight} size={18} themeColor="textTertiary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg },
  body: { flex: 1, gap: 2 },
  status: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  loading: { marginTop: Spacing.six },
});
