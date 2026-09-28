import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loadToken, saveToken, removeToken } from './token-storage';
import { apiClient, onUnauthorized } from './api-client';
import type { Role } from './types';
import { unregisterThisDevice } from '@/lib/push';

interface AuthContextValue {
  token: string | null;
  role: Role | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 정지·영구차단 등으로 로그인이 끊긴 이유(로그인 화면에 보여줌) */
  signedOutReason: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchRole(): Promise<Role | null> {
  try {
    const me = await apiClient.get<{ id: string; role: Role }>('/auth/me');
    return me.role;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [signedOutReason, setSignedOutReason] = useState<string | null>(null);
  // 로그아웃하면 화면 캐시도 비움 — 안 그러면 같은 기기로 다음 사람이 로그인했을 때 앞 사람 대화 목록이 잠깐 보임
  const queryClient = useQueryClient();

  useEffect(() => {
    loadToken().then(async (storedToken) => {
      setToken(storedToken);
      if (storedToken) setRole(await fetchRole());
      setIsLoading(false);
    });
  }, []);

  // 서버가 이 토큰을 더 이상 안 받아주면(정지·영구차단·만료) 로그아웃하고 이유를 남김 — 예전엔 모든 화면이
  // 오류만 나는 상태로 멈춰 있었음. 푸시 해제는 어차피 401이라 건너뜀.
  useEffect(() => {
    onUnauthorized((message) => {
      void removeToken();
      setToken(null);
      setRole(null);
      setSignedOutReason(message);
      queryClient.clear();
    });
    return () => onUnauthorized(null);
  }, [queryClient]);

  const login = async (newToken: string) => {
    setSignedOutReason(null);
    await saveToken(newToken);
    // role까지 먼저 구해서 token/role을 한 틱에 같이 반영 — 안 그러면 AuthGate가
    // "토큰은 있는데 role은 아직 null"인 중간 상태에서 팬 화면으로 잘못 리다이렉트함
    const fetchedRole = await fetchRole();
    // 정지·차단 계정이면 /auth/me가 401 → 위 onUnauthorized가 이미 로그아웃 처리하고 이유를 남김
    if (!fetchedRole) return;
    setToken(newToken);
    setRole(fetchedRole);
  };

  const logout = async () => {
    // 로그인 토큰이 있을 때 먼저 이 기기의 푸시 등록을 해제(안 하면 같은 폰의 다음 사람에게 앞 사람 알림이 감)
    await unregisterThisDevice();
    await removeToken();
    setToken(null);
    setRole(null);
    queryClient.clear();
  };

  return <AuthContext.Provider value={{ token, role, isLoading, login, logout, signedOutReason }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있어요.');
  return ctx;
}
