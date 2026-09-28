import { Linking, Platform } from 'react-native';

/** 스토어의 구독·결제 수단 관리 화면 — 결제는 스토어가 하므로 해지·결제 수단 변경은 거기서(애플·구글 정책) */
export function openStoreSubscriptions(): Promise<void> {
  const url =
    Platform.OS === 'android' ? 'https://play.google.com/store/account/subscriptions' : 'https://apps.apple.com/account/subscriptions';
  return Linking.openURL(url);
}
