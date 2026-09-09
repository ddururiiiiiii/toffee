import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadToken, saveToken, removeToken } from './token-storage';
import { apiClient } from './api-client';
import type { Role } from './types';

interface AuthContextValue {
  token: string | null;
  role: Role | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
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

  useEffect(() => {
    loadToken().then(async (storedToken) => {
      setToken(storedToken);
      if (storedToken) setRole(await fetchRole());
      setIsLoading(false);
    });
  }, []);

  const login = async (newToken: string) => {
    await saveToken(newToken);
    // role까지 먼저 구해서 token/role을 한 틱에 같이 반영 — 안 그러면 AuthGate가
    // "토큰은 있는데 role은 아직 null"인 중간 상태에서 팬 화면으로 잘못 리다이렉트함
    const fetchedRole = await fetchRole();
    setToken(newToken);
    setRole(fetchedRole);
  };

  const logout = async () => {
    await removeToken();
    setToken(null);
    setRole(null);
  };

  return <AuthContext.Provider value={{ token, role, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있어요.');
  return ctx;
}
