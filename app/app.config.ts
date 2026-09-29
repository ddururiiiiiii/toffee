import type { ExpoConfig } from 'expo/config';

// 젤리(gelly/app/app.config.ts) 방식 — eas.json의 "production" 프로필만 APP_VARIANT=production을 넣고,
// 그 외(개발·프리뷰·로컬)는 전부 개발용 식별자를 받음. 실수로 운영 번들 ID로 테스트 빌드를 올리는 사고를 막는 쪽.
const IS_PRODUCTION = process.env.APP_VARIANT === 'production';

// 번들 ID(iOS)·패키지명(안드로이드) — **잠정값(2026-09-29)**. 스토어·Firebase·소셜 로그인 콘솔에 처음 등록하기
// 전까지는 이 한 줄만 바꾸면 됨(등록 후엔 못 바꿈). 회사 이름이 바뀌어도 유지되게 개인 이름이 아니라 브랜드 기준으로.
// 운영 번들 ID는 법인 명의 스토어 계정에만 등록하고, 개인 계정에서 하는 출시 전 테스트는 .dev 쪽만 쓸 것
// (docs/product/ops-infra-backlog.md "계정·소유 구조").
const BUNDLE_ID = 'com.toffeechat.app';
const APP_ID = IS_PRODUCTION ? BUNDLE_ID : `${BUNDLE_ID}.dev`;

const BRAND_BACKGROUND = '#F3EFFD'; // 앱 아이콘 배경(브랜드 앱 아이콘 시안 t-icon-app-icon-light.png)

const config: ExpoConfig = {
  name: IS_PRODUCTION ? 'Toffee' : 'Toffee Dev',
  slug: 'toffee',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: IS_PRODUCTION ? 'toffee' : 'toffee-dev',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'appVersion' },
  ios: {
    bundleIdentifier: APP_ID,
    googleServicesFile: IS_PRODUCTION ? './GoogleService-Info.plist' : './GoogleService-Info.dev.plist',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // 기본(영어) 권한 안내 — 언어별 문구는 아래 locales
      NSCameraUsageDescription: 'Toffee uses the camera when you take a photo or video to send to your fans.',
      NSMicrophoneUsageDescription: 'Toffee uses the microphone to record voice messages and the sound of videos you send to your fans.',
      NSPhotoLibraryUsageDescription: 'Toffee opens your photo library when you choose a photo or video to send to your fans.',
      NSPhotoLibraryAddUsageDescription: 'Toffee saves photos and videos you received to your photo library when you tap Save.',
    },
  },
  // iOS 권한 안내 문구를 기기 언어로(심사·사용자 모두 자기 언어로 보게) — 앱 화면 언어 6개와 같음
  locales: {
    ko: './locales/ko.json',
    th: './locales/th.json',
    en: './locales/en.json',
    ja: './locales/ja.json',
    'zh-Hans': './locales/zh-Hans.json',
    'zh-Hant': './locales/zh-Hant.json',
  },
  android: {
    package: APP_ID,
    googleServicesFile: IS_PRODUCTION ? './google-services.json' : './google-services.dev.json',
    adaptiveIcon: {
      backgroundColor: BRAND_BACKGROUND,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-iap',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 96,
        dark: { backgroundColor: '#0F1115', image: './assets/images/splash-icon-dark.png' },
      },
    ],
    ['@sentry/react-native/expo', { organization: 'ddururiiiiiii', project: 'toffee-app' }],
    // 아래 플러그인들의 권한 문구는 infoPlist(위)·locales가 최종값 — 플러그인 기본 문구가 덮어쓰지 않게 같은 문장을 넘김
    [
      'expo-image-picker',
      {
        photosPermission: 'Toffee opens your photo library when you choose a photo or video to send to your fans.',
        cameraPermission: 'Toffee uses the camera when you take a photo or video to send to your fans.',
        microphonePermission: 'Toffee uses the microphone to record voice messages and the sound of videos you send to your fans.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: 'Toffee uses the microphone to record voice messages and the sound of videos you send to your fans.',
        // 음성 메시지를 화면을 끄거나 다른 앱으로 가도 이어서 듣게(iOS 백그라운드 오디오)
        enableBackgroundPlayback: true,
      },
    ],
    [
      'expo-media-library',
      {
        savePhotosPermission: 'Toffee saves photos and videos you received to your photo library when you tap Save.',
        photosPermission: false,
        granularPermissions: ['photo', 'video'],
      },
    ],
    'expo-video',
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    ['expo-notifications', { color: '#7C8CFF' }],
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
