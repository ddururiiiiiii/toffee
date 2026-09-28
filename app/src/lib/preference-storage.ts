import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// 토큰 외의 작은 사용자 설정값(언어 등) 저장 — 네이티브는 SecureStore, 웹은 localStorage.
// 웹 스토리지는 프라이빗 모드 등에서 막힐 수 있어 전부 try/catch로 감싸고, 실패하면 기본값으로 동작.
export async function loadPreference(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function savePreference(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // 이 세션 동안만 메모리 상태로 동작
    }
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
