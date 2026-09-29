import { Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { useAdminStatsSummary } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { ADMIN_MENU } from '@/constants/admin-menu';
import { useWideLayout } from '@/components/wide-shell';


export default function AdminHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = useAuth();
  const { data: summary } = useAdminStatsSummary();
  // PC 넓은 화면에선 왼쪽 메뉴가 같은 목록이라 여기선 숨김
  const wide = useWideLayout();
  const menu = wide ? [] : ADMIN_MENU.filter((item) => !item.webOnly || Platform.OS === 'web');
  // 앱에선 숫자 요약만(2026-09-28 결정: 앱은 가볍게, 그래프는 통계 화면·웹)
  const cards = summary
    ? [
        { label: '대기 신고', value: summary.reports.pending, href: '/admin/reports' as const, alert: summary.reports.pending > 0 },
        { label: '오늘 가입', value: summary.fans.newToday, href: '/admin/stats' as const },
        { label: '활성 구독', value: summary.subscriptions.active, href: '/admin/stats' as const },
        { label: '오늘 접속', value: summary.fans.activeToday, href: '/admin/stats' as const },
      ]
    : [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ThemedView style={styles.cards}>
        {cards.map((card) => (
          <Pressable
            key={card.label}
            onPress={() => router.push(card.href)}
            style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {card.label}
            </ThemedText>
            <ThemedText type="subtitle" themeColor={card.alert ? 'danger' : 'text'} style={styles.cardValue}>
              {card.value}
            </ThemedText>
          </Pressable>
        ))}
      </ThemedView>
      <ThemedView style={styles.list}>
        {menu.map((item) => (
          <Pressable
            key={item.href}
            onPress={() => router.push(item.href)}
            style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{item.label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {item.description}
            </ThemedText>
          </Pressable>
        ))}
      </ThemedView>

      {/* PC 넓은 화면은 왼쪽 메뉴 아래에 로그아웃이 있음 */}
      {wide ? null : (
        <Pressable onPress={logout} style={[styles.logoutButton, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold" themeColor="danger">
            로그아웃
          </ThemedText>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  card: { flexGrow: 1, flexBasis: 70, borderRadius: 14, padding: Spacing.two, alignItems: 'center' },
  cardValue: { fontSize: 24, lineHeight: 30 },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { borderRadius: 14, padding: Spacing.three, gap: 4 },
  logoutButton: {
    margin: Spacing.four,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
