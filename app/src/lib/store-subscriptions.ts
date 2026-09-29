import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * 스토어 구독 관리 화면 열기 — 스토어 결제 구독은 앱이 해지할 수 없어서(애플·구글 정책) 해지·결제 수단 변경은 여기로 안내.
 * 안드로이드는 이 앱 구독만 보이게 package(+ 상품 ID)를 붙임.
 */
export function openStoreSubscriptions(sku?: string | null) {
  if (Platform.OS === 'ios') return Linking.openURL('https://apps.apple.com/account/subscriptions');
  if (Platform.OS === 'android') {
    const pkg = Constants.expoConfig?.android?.package ?? '';
    return Linking.openURL(`https://play.google.com/store/account/subscriptions?package=${pkg}${sku ? `&sku=${encodeURIComponent(sku)}` : ''}`);
  }
  return Promise.resolve();
}

export function storeName(platform: 'IOS' | 'ANDROID' | null | undefined) {
  return platform === 'ANDROID' ? 'Google Play' : 'App Store';
}
