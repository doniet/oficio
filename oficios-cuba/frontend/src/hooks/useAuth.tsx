import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, configApi, conversationApi, tokenStore } from '../services/api';
import type { User, UserType } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  demo: boolean;
  unread: number;
  refreshUnread: () => void;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; password: string; full_name: string; phone?: string; user_type: UserType }) => Promise<User>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [unread, setUnread] = useState(0);

  // El token guardado se valida contra /auth/me: nunca se confía en datos cacheados.
  useEffect(() => {
    configApi.get().then((r) => setDemo(r.data.demo)).catch(() => {});
    if (!tokenStore.get()) {
      setIsLoading(false);
      return;
    }
    authApi.me()
      .then((r) => setUser({ ...r.data.user, is_verified: Boolean(r.data.user.is_verified) }))
      .catch(() => tokenStore.clear())
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('oc:unauthorized', onUnauthorized);
    return () => window.removeEventListener('oc:unauthorized', onUnauthorized);
  }, []);

  const refreshUnread = useCallback(() => {
    if (!tokenStore.get()) return;
    conversationApi.unreadCount().then((r) => setUnread(r.data.count)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    refreshUnread();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshUnread();
    }, 30000);
    return () => window.clearInterval(t);
  }, [user, refreshUnread]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login({ email, password });
    tokenStore.set(data.token);
    setUser(data.user);
    return data.user as User;
  }, []);

  const register = useCallback(async (payload: Parameters<AuthContextType['register']>[0]) => {
    const { data } = await authApi.register(payload);
    tokenStore.set(data.token);
    setUser(data.user);
    return data.user as User;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const updateUser = useCallback((data: Partial<User>) => {
    setUser((u) => (u ? { ...u, ...data } : u));
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, demo, unread, refreshUnread, login, register, logout, updateUser }),
    [user, isLoading, demo, unread, refreshUnread, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
