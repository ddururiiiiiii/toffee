import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ADMIN_MENU } from '@/constants/admin-menu';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/constants/theme';

// 이 폭 이상인 PC 브라우저에서만 넓은 배치(태블릿 세로·폰은 지금처럼)
export const WIDE_MIN_WIDTH = 1024;
const SIDEBAR_WIDTH = 248;

/** 운영자·소속사 화면을 PC 웹 넓은 배치(왼쪽 메뉴 + 오른쪽 내용)로 보여 주는 중인지 */
export function useWideLayout() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  return Platform.OS === 'web' && width >= WIDE_MIN_WIDTH && (pathname.startsWith('/admin') || pathname.startsWith('/console'));
}

/**
 * PC용 넓은 화면(2026-09-29, 정산과 함께) — 운영자(/admin)·소속사(/console) 화면을 PC 웹에서 열면 왼쪽에 메뉴를 고정하고 오른쪽에
 * 지금 화면을 보여 줌. 화면 코드는 그대로(같은 코드가 폰에선 지금처럼 한 칸). 팬·스타 화면은 해당 없음.
 */
export function WideShell({ children }: { children: ReactNode }) {
  const wide = useWideLayout();
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuth();
  if (!wide) return <>{children}</>;

  const isAdmin = pathname.startsWith('/admin');
  const items: { href: string; label: string }[] = isAdmin
    ? [{ href: '/admin', label: '홈' }, ...ADMIN_MENU.map((item) => ({ href: item.href, label: item.label }))]
    : [
        { href: '/console', label: t('console.title') },
        { href: '/console/settlements', label: t('settlement.title') },
      ];
  // 가장 길게 맞는 메뉴를 선택된 것으로(/console/<배우>는 "배우 모니터링")
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <View style={styles.row}>
      <View style={[styles.sidebar, { borderRightColor: theme.border, backgroundColor: theme.background }]}>
        <ThemedText type="title" style={{ color: theme.tint }}>
          Toffee
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.role}>
          {isAdmin ? '운영자' : t('screens.console')}
        </ThemedText>
        <ScrollView contentContainerStyle={styles.menu}>
          {items.map((item) => {
            const selected = item.href === active;
            return (
              <Pressable
                key={item.href}
                onPress={() => router.navigate(item.href as Href)}
                accessibilityRole="link"
                accessibilityState={{ selected }}
                style={({ hovered }) => [
                  styles.item,
                  { backgroundColor: selected ? theme.backgroundSelected : hovered ? theme.backgroundElement : 'transparent' },
                ]}>
                <ThemedText type={selected ? 'smallBold' : 'small'}>{item.label}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable onPress={logout} accessibilityRole="button" style={styles.item}>
          <ThemedText type="small" themeColor="danger">
            {t('profile.logout')}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  sidebar: { width: SIDEBAR_WIDTH, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingVertical: Spacing.four, gap: Spacing.one },
  role: { marginBottom: Spacing.three },
  menu: { gap: 2 },
  item: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderRadius: Radius.md },
  content: { flex: 1 },
});
