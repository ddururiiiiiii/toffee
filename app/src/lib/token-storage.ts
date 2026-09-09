import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'toffee_access_token';

// api-client가 매 요청마다 async 스토리지를 안 기다리게 메모리에도 캐싱해둠
let cachedToken: string | null = null;

export function getCachedToken(): string | null {
  return cachedToken;
}

export async function loadToken(): Promise<string | null> {
  const token = Platform.OS === 'web' ? readWebStorage() : await SecureStore.getItemAsync(KEY);
  cachedToken = token;
  return token;
}

export async function saveToken(token: string): Promise<void> {
  cachedToken = token;
  if (Platform.OS === 'web') {
    writeWebStorage(token);
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function removeToken(): Promise<void> {
  cachedToken = null;
  if (Platform.OS === 'web') {
    clearWebStorage();
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

// expo-secure-store는 웹에서 안 돼서(SSR/프라이빗 모드에서 막힐 수도 있음) try/catch로 감쌈
function readWebStorage(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeWebStorage(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // 조용히 무시 — 이 세션 동안 메모리 캐시로만 동작
  }
}
function clearWebStorage(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
