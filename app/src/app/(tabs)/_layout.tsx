import { Tabs } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.backgroundElement },
        // 아이콘 세트는 아직 안 붙였음 — 기본 플레이스홀더 아이콘 대신 텍스트 라벨만 표시
        tabBarIcon: () => null,
      }}>
      <Tabs.Screen name="index" options={{ title: '배우' }} />
      <Tabs.Screen name="chats" options={{ title: '대화' }} />
      <Tabs.Screen name="mypage" options={{ title: '마이' }} />
    </Tabs>
  );
}
