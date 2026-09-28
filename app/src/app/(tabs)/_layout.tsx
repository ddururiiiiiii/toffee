import { useEffect, useRef } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Compass, MessageCircle, UserRound } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { fontFor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMySubscriptions } from '@/hooks/use-subscriptions';

// DESIGN_GUIDE §2: 하단 탭은 Discover / Inbox / Profile 3개만(Home 탭 없음)
export default function TabsLayout() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data: subscriptions } = useMySubscriptions();
  // DESIGN_GUIDE §2: 구독 중인 배우가 있으면 앱을 열 때 Inbox부터, 없으면 Discover(첫 진입 한 번만)
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !subscriptions) return;
    decided.current = true;
    if (subscriptions.length > 0) router.replace('/chats');
  }, [subscriptions, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarLabelStyle: { ...fontFor(500, i18n.language), fontSize: 11, lineHeight: 14 },
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.discover'),
          tabBarIcon: ({ color, focused }) => <Icon as={Compass} size={24} color={focused ? theme.tint : color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t('tabs.inbox'),
          tabBarIcon: ({ color, focused }) => <Icon as={MessageCircle} size={24} color={focused ? theme.tint : color} />,
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, focused }) => <Icon as={UserRound} size={24} color={focused ? theme.tint : color} />,
        }}
      />
    </Tabs>
  );
}
