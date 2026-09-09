import { useEffect, type ReactNode } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// 토큰 없이 진입 시 /login으로, 로그인 후엔 role 따라 콘솔(스태프/관리자) 또는 팬 탭으로 —
// 전부 로딩(토큰+role 조회) 끝난 뒤에만 판단
function AuthGate({ children }: { children: ReactNode }) {
  const { token, role, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const onLoginScreen = segments[0] === 'login';
    if (!token && !onLoginScreen) {
      router.replace('/login');
    } else if (token && onLoginScreen) {
      router.replace(role === 'AGENCY_STAFF' || role === 'ADMIN' ? '/console' : '/');
    }
  }, [token, role, isLoading, segments, router]);

  return children;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" />
              <Stack.Screen name="actor/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="chat/[actorId]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="console/index" options={{ headerShown: true, title: '콘솔' }} />
              <Stack.Screen name="console/[actorId]" options={{ headerShown: true, title: '' }} />
            </Stack>
          </AuthGate>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
