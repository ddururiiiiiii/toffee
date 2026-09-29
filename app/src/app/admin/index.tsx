import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { useAdminStatsSummary } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

const MENU: {
  href: '/admin/reports' | '/admin/banned-words' | '/admin/users' | '/admin/actors' | '/admin/bundles' | '/admin/agencies' | '/admin/stats' | '/admin/actions';
  label: string;
  description: string;
}[] = [
  { href: '/admin/stats', label: '통계', description: '가입·구독·해지 추이, 국가·가입 경로, 배우별 구독(PC에서 넓게)' },
  { href: '/admin/reports', label: '신고 처리', description: '신고된 메시지를 검토하고 승인/기각해요' },
  { href: '/admin/banned-words', label: '금칙어 관리', description: '팬 답장에서 자동으로 차단할 단어를 관리해요' },
  { href: '/admin/users', label: '회원 관리', description: '회원 정지·영구차단, 배우·소속사 직원 계정 지정' },
  { href: '/admin/actors', label: '배우 관리', description: '배우 등록, 프로필 사진, 소속사 이적, 본인 계정 연결' },
  { href: '/admin/bundles', label: '묶음 상품', description: '여러 배우를 할인가로 묶어 파는 구독 상품, 스토어 상품 ID' },
  { href: '/admin/agencies', label: '소속사 관리', description: '소속사 등록, 이름·로고 변경' },
  { href: '/admin/actions', label: '작업 기록', description: '누가 언제 정지·차단·역할 변경·신고 처리·배우 활동 종료를 했는지' },
];

export default function AdminHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = useAuth();
  const { data: summary } = useAdminStatsSummary();
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
        {MENU.map((item) => (
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
