import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { useMySubscriptions, useUnsubscribe, type Subscription } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

function formatPrice(cents: number) {
  return `฿${(cents / 100).toFixed(0)}/월`;
}

function SubscriptionRow({ subscription }: { subscription: Subscription }) {
  const theme = useTheme();
  const unsubscribe = useUnsubscribe(subscription.actorId);

  const confirmUnsubscribe = () => {
    Alert.alert('구독 해지', `${subscription.actor.chatDisplayName} 구독을 해지할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '해지', style: 'destructive', onPress: () => unsubscribe.mutate() },
    ]);
  };

  return (
    <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <Image
        source={{ uri: subscription.actor.chatProfileImageUrl ?? undefined }}
        style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}
      />
      <ThemedView style={styles.rowBody}>
        <ThemedText type="smallBold">{subscription.actor.chatDisplayName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatPrice(subscription.actor.monthlyPriceCents)} · {new Date(subscription.startedAt).toLocaleDateString('ko-KR')}부터
        </ThemedText>
      </ThemedView>
      <Pressable onPress={confirmUnsubscribe} disabled={unsubscribe.isPending} style={styles.unsubscribeButton}>
        <ThemedText type="small" themeColor="danger">
          해지
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

export default function MyPageScreen() {
  const theme = useTheme();
  const { logout } = useAuth();
  const { data: subscriptions, isLoading } = useMySubscriptions();

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        마이페이지
      </ThemedText>

      <ThemedText type="smallBold" style={styles.sectionLabel}>
        구독 관리
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionHint}>
        결제 없이 구독 상태만 관리하는 데모 화면이에요. 실제 환불 규정은 정식 출시 때 앱스토어 정책을 따라요.
      </ThemedText>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : (
        <FlatList
          data={subscriptions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyMessage}>
              구독 중인 배우가 없어요.
            </ThemedText>
          }
          renderItem={({ item }) => <SubscriptionRow subscription={item} />}
        />
      )}

      <Pressable onPress={logout} style={[styles.logoutButton, { borderColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold" themeColor="danger">
          로그아웃
        </ThemedText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 32, lineHeight: 40, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  sectionLabel: { paddingHorizontal: Spacing.four, marginTop: Spacing.four },
  sectionHint: { paddingHorizontal: Spacing.four, marginTop: 2 },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: Spacing.three, gap: Spacing.three },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  rowBody: { flex: 1, gap: 2 },
  unsubscribeButton: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  emptyMessage: { textAlign: 'center', marginTop: Spacing.four },
  loading: { marginTop: Spacing.four },
  logoutButton: {
    margin: Spacing.four,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
