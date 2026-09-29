import { InAppBanner } from '@/components/in-app-banner';
import { useEffect, type ReactNode } from 'react';
import {
  NotoSansThai_400Regular,
  NotoSansThai_500Medium,
  NotoSansThai_600SemiBold,
  NotoSansThai_700Bold,
} from '@expo-google-fonts/noto-sans-thai';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as Sentry from '@sentry/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, Platform, useColorScheme, type AppStateStatus } from 'react-native';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import '@/i18n';
import { SplashOverlay } from '@/components/splash-overlay';
import { Colors, fontFor } from '@/constants/theme';
import { LocalePreferenceProvider } from '@/i18n/locale-preference-context';
import { useSyncLocale } from '@/hooks/use-sync-locale';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { useOnboardingStatus } from '@/hooks/use-onboarding';
import { useMySubscriptions } from '@/hooks/use-subscriptions';
import { useRealtimeSync } from '@/lib/realtime';

// DSN이 비어 있으면(로컬 개발) SDK가 아무것도 전송하지 않고 조용히 꺼진 채로 동작함.
// 앱 쪽은 요청 바디/헤더를 자동 수집하지 않고 사용자 정보도 붙이지 않음(PII 없음).
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
});

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// 앱이 백그라운드로 가면 react-query가 "화면을 안 보고 있음"으로 알게 해서 5초 폴링 등을 멈추고, 다시 앞으로 오면 바로
// 새로고침(refetchOnWindowFocus) — 예전엔 네이티브에서 이 연결이 없어 백그라운드에서도 계속 조회했고, 돌아와도 다음 폴링까지
// 옛 화면이었음(2026-09-28 점검). 웹은 브라우저 탭 전환을 react-query가 원래 알아서 처리.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status: AppStateStatus) => focusManager.setFocused(status === 'active'));
}

// 토큰 없이 진입 시 /login으로. 로그인 후엔 온보딩(약관 동의 → 생년월일 → 필요시 법정대리인 동의 → 닉네임)부터
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

    // 온보딩은 단계별로 정확한 화면에 있어야 함 — 예전엔 "온보딩 화면 중 아무 데나"면 그대로 둬서, 생년월일을
    // 저장해도 부모 동의·닉네임 단계로 안 넘어가고 생년월일 화면에 멈춰 있었음(새 팬 가입이 막히던 버그)
    const onOnboardingScreen = segments[0] === 'onboarding';
    // 약관 동의 화면에서 "보기"로 약관·개인정보처리방침을 열 수 있어야 해서 온보딩 중에도 이 두 화면은 허용
    const onLegalScreen = segments[0] === 'terms' || segments[0] === 'privacy';
    const onboardingStep = onboarding?.needsTerms
      ? 'terms'
      : onboarding?.needsBirthDate
        ? 'birth-date'
        : onboarding?.parentalConsentStatus === 'UNDERAGE'
          ? 'underage'
          : onboarding?.parentalConsentStatus === 'PENDING'
            ? 'parental-consent'
            : onboarding?.needsNickname
              ? 'nickname'
              : null;
    if (onboardingStep) {
      if (onLegalScreen) return;
      if (!onOnboardingScreen || (segments as string[])[1] !== onboardingStep) router.replace(`/onboarding/${onboardingStep}`);
      return;
    }

    // 역할별 첫 화면 — 로그인/온보딩 직후뿐 아니라 저장된 로그인으로 앱을 다시 켰을 때 팬 탭으로
    // 떨어진 경우에도 제 화면으로 보냄(예전엔 로그인 직후에만 분기해서 재실행 시 팬 탭에 머물렀음)
    const home = role === 'ADMIN' ? '/admin' : role === 'AGENCY_STAFF' ? '/console' : role === 'ACTOR' ? '/studio' : '/';
    const onFanTabs = segments[0] === '(tabs)';
    // 역할별 영역 — 주소를 직접 쳐서 다른 역할 화면에 들어오면 제 화면으로(데이터는 서버가 막지만 화면 틀도 안 보이게).
    // 운영자는 확인용으로 콘솔·스튜디오도 열 수 있음.
    const areaRoles: Record<string, string[]> = {
      admin: ['ADMIN'],
      console: ['AGENCY_STAFF', 'ADMIN'],
      studio: ['ACTOR', 'ADMIN'],
      blocks: ['ACTOR', 'AGENCY_STAFF', 'ADMIN'],
    };
    const allowed = areaRoles[segments[0] ?? ''];
    const wrongArea = !!allowed && !allowed.includes(role ?? '');
    if (onLoginScreen || onOnboardingScreen || (onFanTabs && home !== '/') || wrongArea) {
      router.replace(home);
    }
  }, [token, role, isLoading, onboarding, onboardingLoading, segments, router]);

  return children;
}

export default Sentry.wrap(RootLayout);

// 로그인 상태에 따라 돌아야 하는 백그라운드 작업들(언어 동기화, 푸시 등록·알림 처리, 실시간 연결)
function SessionEffects() {
  useSyncLocale();
  usePushNotifications();
  const { token } = useAuth();
  const { data: subscriptions } = useMySubscriptions();
  // 구독이 바뀌면 다시 연결(서버가 연결할 때 받을 채팅방 목록을 읽음)
  const audienceKey = (subscriptions ?? []).map((sub) => sub.actorId).sort().join(',');
  useRealtimeSync(token, audienceKey);
  return null;
}

function RootLayout() {
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const [fontsLoaded, fontError] = useFonts({
    Pretendard_400Regular: require('@/../assets/fonts/Pretendard-Regular.otf'),
    Pretendard_500Medium: require('@/../assets/fonts/Pretendard-Medium.otf'),
    Pretendard_600SemiBold: require('@/../assets/fonts/Pretendard-SemiBold.otf'),
    Pretendard_700Bold: require('@/../assets/fonts/Pretendard-Bold.otf'),
    NotoSansThai_400Regular,
    NotoSansThai_500Medium,
    NotoSansThai_600SemiBold,
    NotoSansThai_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <LocalePreferenceProvider>
      <AuthProvider>
        <SessionEffects />
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <SplashOverlay />
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                // 모든 상단바 공통 — 그림자 없이 흰 배경, 제목은 브랜드 글꼴(가이드: 깔끔·절제)
                headerShadowVisible: false,
                headerStyle: { backgroundColor: palette.background },
                headerTintColor: palette.text,
                headerTitleStyle: { ...fontFor(600, i18n.language), fontSize: 17 },
                headerBackButtonDisplayMode: 'minimal',
                contentStyle: { backgroundColor: palette.background },
              }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" />
              <Stack.Screen name="actor/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="subscribe/[actorId]" options={{ headerShown: false }} />
              <Stack.Screen name="subscriptions/index" options={{ headerShown: true, title: t('profile.manageSubscriptions') }} />
              <Stack.Screen name="subscriptions/[actorId]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="settings/language" options={{ headerShown: true, title: t('profile.language') }} />
              <Stack.Screen name="settings/nickname" options={{ headerShown: true, title: t('profile.editNickname') }} />
              <Stack.Screen name="settings/notifications" options={{ headerShown: true, title: t('profile.notifications') }} />
              <Stack.Screen name="chat/[actorId]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="report" options={{ headerShown: true, title: t('report.title'), presentation: 'modal' }} />
              <Stack.Screen name="blocks/[actorId]" options={{ headerShown: true, title: t('block.manage') }} />
              <Stack.Screen name="media-viewer" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
              <Stack.Screen name="studio/index" options={{ headerShown: true, title: t('studio.screen') }} />
              <Stack.Screen name="studio/[actorId]/index" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="studio/[actorId]/profile" options={{ headerShown: true, title: t('studioProfile.title') }} />
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
              <Stack.Screen name="admin/actors/index" options={{ headerShown: true, title: '배우 관리' }} />
              <Stack.Screen name="admin/actors/new" options={{ headerShown: true, title: '배우 등록' }} />
              <Stack.Screen name="admin/actors/[id]" options={{ headerShown: true, title: '배우' }} />
              <Stack.Screen name="admin/agencies" options={{ headerShown: true, title: '소속사 관리' }} />
              <Stack.Screen name="admin/stats" options={{ headerShown: true, title: '통계' }} />
              <Stack.Screen name="admin/actions" options={{ headerShown: true, title: '작업 기록' }} />
              <Stack.Screen name="onboarding/terms" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/birth-date" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/nickname" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/parental-consent" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/underage" options={{ headerShown: false }} />
              <Stack.Screen name="terms" options={{ headerShown: true, title: t('screens.terms') }} />
              <Stack.Screen name="privacy" options={{ headerShown: true, title: t('screens.privacy') }} />
            </Stack>
            <InAppBanner />
          </AuthGate>
        </ThemeProvider>
      </AuthProvider>
      </LocalePreferenceProvider>
    </QueryClientProvider>
  );
}
