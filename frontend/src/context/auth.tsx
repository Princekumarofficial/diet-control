import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

import { apiFetch, getApiAuthToken, setApiAuthToken } from '@/src/api/client';

type AuthContextValue = {
  token: string | null;
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  setToken: (token: string | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_TOKEN_KEY = 'project_shred_auth_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getApiAuthToken());
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function hydrateToken() {
      try {
        const storedToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        if (!isMounted) return;

        const normalized = storedToken?.trim() ? storedToken.trim() : null;
        if (!normalized) {
          setApiAuthToken(null);
          setTokenState(null);
          return;
        }

        setApiAuthToken(normalized);

        try {
          const res = await apiFetch('/api/v1/auth/me/');
          if (!isMounted) return;

          if (res.ok) {
            setTokenState(normalized);
          } else if (res.status === 401 || res.status === 403) {
            await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
            setApiAuthToken(null);
            setTokenState(null);
          } else {
            // Keep token on transient server errors so users are not logged out unnecessarily.
            setTokenState(normalized);
          }
        } catch {
          if (!isMounted) return;
          // Keep token during offline/network failures.
          setTokenState(normalized);
        }
      } catch {
        if (!isMounted) return;
        setApiAuthToken(null);
        setTokenState(null);
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    }

    hydrateToken();
    return () => {
      isMounted = false;
    };
  }, []);

  async function setToken(nextToken: string | null) {
    const normalized = nextToken?.trim() ? nextToken.trim() : null;
    setApiAuthToken(normalized);
    setTokenState(normalized);
    try {
      if (normalized) {
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, normalized);
      } else {
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
      }
    } catch {
      // Keep in-memory auth usable even if persistence fails.
    }
  }

  function logout() {
    void setToken(null);
  }

  const value = useMemo(
    () => ({
      token,
      isAuthLoading,
      isAuthenticated: Boolean(token),
      setToken,
      logout,
    }),
    [token, isAuthLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
