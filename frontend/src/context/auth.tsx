import { createContext, useContext, useMemo, useState } from 'react';

import { getApiAuthToken, setApiAuthToken } from '@/src/api/client';

type AuthContextValue = {
  token: string | null;
  isAuthenticated: boolean;
  setToken: (token: string | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getApiAuthToken());

  function setToken(nextToken: string | null) {
    setApiAuthToken(nextToken);
    setTokenState(nextToken?.trim() ? nextToken.trim() : null);
  }

  function logout() {
    setToken(null);
  }

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      setToken,
      logout,
    }),
    [token]
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
