import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'toffee_access_token';

// api-client가 매 요청마다 async 스토리지를 안 기다리게 메모리에도 캐싱해둠
let cachedToken: string | null = null;
let loading: Promise<void> | null = null;

export function getCachedToken(): string | null {
  return cachedToken;
}

/**
 * 저장된 토큰은 처음 한 번만 읽고, 이후엔 메모리 값(로그인·로그아웃 반영)을 돌려줌 — 앱을 켜자마자(알림으로
 * 채팅방 바로 열기 등) 나가는 요청이 토큰을 읽기 전에 보내져 401 나던 것 방지(api-client가 이걸 기다림)
 */
export async function loadToken(): Promise<string | null> {
  loading ??= (async () => {
    const stored = Platform.OS === 'web' ? readWebStorage() : await SecureStore.getItemAsync(KEY);
    // 읽는 사이에 로그인/로그아웃이 먼저 끝났으면 그 값을 유지
    if (!settled) cachedToken = stored;
  })();
  await loading;
  return cachedToken;
}

// 저장소를 다 읽기 전에 saveToken/removeToken이 불리면 그쪽이 최신 값
let settled = false;

export async function saveToken(token: string): Promise<void> {
  settled = true;
  cachedToken = token;
  if (Platform.OS === 'web') {
    writeWebStorage(token);
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function removeToken(): Promise<void> {
  settled = true;
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
