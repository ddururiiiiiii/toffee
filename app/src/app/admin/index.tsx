import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { useAdminStatsSummary, useDemoStatus, useResetDemo } from '@/hooks/use-admin';
import { confirm } from '@/lib/confirm';
import { ApiError } from '@/lib/api-client';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { ADMIN_MENU } from '@/constants/admin-menu';
import { useWideLayout } from '@/components/wide-shell';


export default function AdminHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = useAuth();
  const { data: summary } = useAdminStatsSummary();
  // 데모 서버에서만 보이는 "데모 초기화"(2026-10-01) — 데모 계정은 고정 ID라 초기화해도 로그인이 유지됨
  const { data: demo } = useDemoStatus();
  const resetDemo = useResetDemo();
  const onResetDemo = async () => {
    const ok = await confirm(
      '데모 초기화',
      '데모 데이터(배우·팬·메시지·구독·신고 등)를 모두 지우고 처음 상태로 되돌려요. 직접 만든 계정은 지워지고, 데모 계정(fan1@toffee.demo 등)은 그대로 로그인돼 있어요. 소속사에 데모를 보여 주는 중에는 누르지 마세요.',
      '초기화',
      '취소',
    );
    if (ok) resetDemo.mutate();
  };
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
      {/* 메뉴 + 데모 초기화까지 길어져서 스크롤(2026-10-01) */}
      <ScrollView>
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

      {demo?.enabled ? (
        <ThemedView style={styles.list}>
          <Pressable
            onPress={onResetDemo}
            disabled={resetDemo.isPending}
            accessibilityRole="button"
            style={[styles.row, { backgroundColor: theme.backgroundElement, opacity: resetDemo.isPending ? 0.6 : 1 }]}>
            <ThemedText type="smallBold" themeColor="danger">
              {resetDemo.isPending ? '초기화하는 중…' : '데모 초기화'}
            </ThemedText>
            <ThemedText type="small" themeColor={resetDemo.isError ? 'danger' : 'textSecondary'}>
              {resetDemo.isError
                ? resetDemo.error instanceof ApiError
                  ? resetDemo.error.message
                  : '초기화하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
                : resetDemo.isSuccess
                  ? '처음 상태로 되돌렸어요.'
                  : '데모 서버에서만 보여요. 데이터를 처음 상태로 되돌려요.'}
            </ThemedText>
          </Pressable>
        </ThemedView>
      ) : null}

      {/* PC 넓은 화면은 왼쪽 메뉴 아래에 로그아웃이 있음 */}
      {wide ? null : (
        <Pressable onPress={logout} style={[styles.logoutButton, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold" themeColor="danger">
            로그아웃
          </ThemedText>
        </Pressable>
      )}
      </ScrollView>
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
