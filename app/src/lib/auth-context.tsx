import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadToken, saveToken, removeToken } from './token-storage';

interface AuthContextValue {
  token: string | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadToken().then((storedToken) => {
      setToken(storedToken);
      setIsLoading(false);
    });
  }, []);

  const login = async (newToken: string) => {
    await saveToken(newToken);
    setToken(newToken);
  };

  const logout = async () => {
    await removeToken();
    setToken(null);
  };

  return <AuthContext.Provider value={{ token, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있어요.');
  return ctx;
}
