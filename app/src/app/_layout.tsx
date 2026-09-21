import { useEffect, type ReactNode } from 'react';
import { NotoSansThai_400Regular } from '@expo-google-fonts/noto-sans-thai';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { useOnboardingStatus } from '@/hooks/use-onboarding';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// 토큰 없이 진입 시 /login으로. 로그인 후엔 온보딩(생년월일 → 필요시 법정대리인 동의)부터
// 끝내야 하고, 그다음 role 따라 운영자는 /admin, 소속사 스태프는 /console, 나머지(팬)는
// 기본 탭으로 — 전부 로딩(토큰+role+온보딩 상태 조회) 끝난 뒤에만 판단.
// ACTOR(배우 본인) 전용 화면은 아직 없어서 지금은 팬 탭으로 빠짐(별도 트래킹 중)
function AuthGate({ children }: { children: ReactNode }) {
  const { token, role, isLoading } = useAuth();
  const { data: onboarding, isLoading: onboardingLoading } = useOnboardingStatus();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const onLoginScreen = segments[0] === 'login';
    if (!token) {
      if (!onLoginScreen) router.replace('/login');
      return;
    }
    if (onboardingLoading) return;

    const onOnboardingScreen = segments[0] === 'onboarding';
    if (onboarding?.needsBirthDate) {
      if (!onOnboardingScreen) router.replace('/onboarding/birth-date');
      return;
    }
    if (onboarding?.parentalConsentStatus === 'PENDING') {
      if (!onOnboardingScreen) router.replace('/onboarding/parental-consent');
      return;
    }

    if (onLoginScreen || onOnboardingScreen) {
      if (role === 'ADMIN') router.replace('/admin');
      else if (role === 'AGENCY_STAFF') router.replace('/console');
      else router.replace('/');
    }
  }, [token, role, isLoading, onboarding, onboardingLoading, segments, router]);

  return children;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({ NotoSansThai_400Regular });

  if (!fontsLoaded && !fontError) return null;

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
              <Stack.Screen name="admin/index" options={{ headerShown: true, title: '운영자' }} />
              <Stack.Screen name="admin/reports" options={{ headerShown: true, title: '신고 처리' }} />
              <Stack.Screen name="admin/banned-words" options={{ headerShown: true, title: '금칙어 관리' }} />
              <Stack.Screen name="admin/users" options={{ headerShown: true, title: '회원 관리' }} />
              <Stack.Screen name="onboarding/birth-date" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/parental-consent" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="terms" options={{ headerShown: true, title: '이용약관' }} />
              <Stack.Screen name="privacy" options={{ headerShown: true, title: '개인정보처리방침' }} />
            </Stack>
          </AuthGate>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
