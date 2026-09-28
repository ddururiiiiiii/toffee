import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

const MENU: {
  href: '/admin/reports' | '/admin/banned-words' | '/admin/users' | '/admin/actors' | '/admin/agencies';
  label: string;
  description: string;
}[] = [
  { href: '/admin/reports', label: '신고 처리', description: '신고된 메시지를 검토하고 승인/기각해요' },
  { href: '/admin/banned-words', label: '금칙어 관리', description: '팬 답장에서 자동으로 차단할 단어를 관리해요' },
  { href: '/admin/users', label: '회원 관리', description: '회원 정지·영구차단, 배우·소속사 직원 계정 지정' },
  { href: '/admin/actors', label: '배우 관리', description: '배우 등록, 프로필 사진, 소속사 이적, 본인 계정 연결' },
  { href: '/admin/agencies', label: '소속사 관리', description: '소속사 등록, 이름·로고 변경' },
];

export default function AdminHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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
