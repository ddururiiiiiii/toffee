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
// 끝내야 하고(팬만 해당), 그다음 role 따라 운영자는 /admin, 소속사 스태프는 /console, 나머지(팬)는
// 기본 탭으로 — 전부 로딩(토큰+role+온보딩 상태 조회) 끝난 뒤에만 판단.
// 배우 본인(ACTOR)은 /studio(발송 화면)로.
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

    // 역할별 첫 화면 — 로그인/온보딩 직후뿐 아니라 저장된 로그인으로 앱을 다시 켰을 때 팬 탭으로
    // 떨어진 경우에도 제 화면으로 보냄(예전엔 로그인 직후에만 분기해서 재실행 시 팬 탭에 머물렀음)
    const home = role === 'ADMIN' ? '/admin' : role === 'AGENCY_STAFF' ? '/console' : role === 'ACTOR' ? '/studio' : '/';
    const onFanTabs = segments[0] === '(tabs)';
    if (onLoginScreen || onOnboardingScreen || (onFanTabs && home !== '/')) {
      router.replace(home);
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
              <Stack.Screen name="media-viewer" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
              <Stack.Screen name="studio/index" options={{ headerShown: true, title: t('studio.screen') }} />
              <Stack.Screen name="studio/[actorId]/index" options={{ headerShown: true, title: '' }} />
              <Stack.Screen
                name="studio/[actorId]/replies/[messageId]"
                options={{ headerShown: true, title: t('studio.repliesScreen') }}
              />
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
