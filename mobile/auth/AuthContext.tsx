import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '@/services/api';
import { authApi, type AuthSession, type AuthUser } from '@/services/auth';

const SESSION_KEY = 'self-smart-checkout.session.v1';

type AuthContextValue = {
  isLoading: boolean;
  session: AuthSession | null;
  login: (email: string, password: string) => Promise<AuthSession>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<AuthUser>;
  return typeof user.id === 'string' && typeof user.name === 'string' && typeof user.email === 'string'
    && (user.role === 'CUSTOMER' || user.role === 'GUARD' || user.role === 'SALESMAN');
}

function parseSession(value: string | null): AuthSession | null {
  if (!value) return null;
  try {
    const session = JSON.parse(value) as Partial<AuthSession>;
    return typeof session.token === 'string' && isUser(session.user)
      ? { token: session.token, user: session.user }
      : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(SESSION_KEY)
      .then(async (saved) => {
        const storedSession = parseSession(saved);
        if (!storedSession) {
          if (saved) await SecureStore.deleteItemAsync(SESSION_KEY);
          return null;
        }
        try {
          const { user } = await authApi.me(storedSession.token);
          return { ...storedSession, user };
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            await SecureStore.deleteItemAsync(SESSION_KEY);
            return null;
          }
          return storedSession;
        }
      })
      .then(async (restored) => {
        if (active && restored) {
          await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(restored));
          setSession(restored);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const saveSession = useCallback(async (next: AuthSession) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await authApi.login(email, password);
    await saveSession(next);
    return next;
  }, [saveSession]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    await saveSession(await authApi.register(name, email, password));
  }, [saveSession]);

  const logout = useCallback(async () => {
    const current = session;
    try {
      if (current) await authApi.logout(current.token);
    } finally {
      try {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      } finally {
        setSession(null);
      }
    }
  }, [session]);

  const value = useMemo(() => ({ isLoading, session, login, register, logout }), [isLoading, session, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
