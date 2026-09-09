import { useEffect, type ReactNode } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// 토큰 없이 (tabs) 진입 시 /login으로, 토큰 있는데 /login에 있으면 홈으로 — 둘 다 로딩 끝난 뒤에만 판단
function AuthGate({ children }: { children: ReactNode }) {
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const onLoginScreen = segments[0] === 'login';
    if (!token && !onLoginScreen) {
      router.replace('/login');
    } else if (token && onLoginScreen) {
      router.replace('/');
    }
  }, [token, isLoading, segments, router]);

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
            </Stack>
          </AuthGate>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
