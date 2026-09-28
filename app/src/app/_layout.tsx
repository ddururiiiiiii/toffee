import { useEffect, type ReactNode } from 'react';
import { NotoSansThai_400Regular } from '@expo-google-fonts/noto-sans-thai';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as Sentry from '@sentry/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import '@/i18n';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LocalePreferenceProvider } from '@/i18n/locale-preference-context';
import { useSyncLocale } from '@/hooks/use-sync-locale';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { useOnboardingStatus } from '@/hooks/use-onboarding';

// DSN이 비어 있으면(로컬 개발) SDK가 아무것도 전송하지 않고 조용히 꺼진 채로 동작함.
// 앱 쪽은 요청 바디/헤더를 자동 수집하지 않고 사용자 정보도 붙이지 않음(PII 없음).
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
});

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

export default Sentry.wrap(RootLayout);

function LocaleSync() {
  useSyncLocale();
  return null;
}

function RootLayout() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({ NotoSansThai_400Regular });

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <LocalePreferenceProvider>
      <AuthProvider>
        <LocaleSync />
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" />
              <Stack.Screen name="actor/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="chat/[actorId]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="console/index" options={{ headerShown: true, title: t('screens.console') }} />
              <Stack.Screen name="console/[actorId]" options={{ headerShown: true, title: '' }} />
              {/* 운영자 화면은 운영자(한국어) 전용이라 의도적으로 다국어 처리 안 함 */}
              <Stack.Screen name="admin/index" options={{ headerShown: true, title: '운영자' }} />
              <Stack.Screen name="admin/reports" options={{ headerShown: true, title: '신고 처리' }} />
              <Stack.Screen name="admin/banned-words" options={{ headerShown: true, title: '금칙어 관리' }} />
              <Stack.Screen name="admin/users" options={{ headerShown: true, title: '회원 관리' }} />
              <Stack.Screen name="onboarding/birth-date" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/parental-consent" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="terms" options={{ headerShown: true, title: t('screens.terms') }} />
              <Stack.Screen name="privacy" options={{ headerShown: true, title: t('screens.privacy') }} />
            </Stack>
          </AuthGate>
        </ThemeProvider>
      </AuthProvider>
      </LocalePreferenceProvider>
    </QueryClientProvider>
  );
}
