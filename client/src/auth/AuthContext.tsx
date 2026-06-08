import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthResponse, AuthUser } from '@shared/protocol';
import { connectSocket, disconnectSocket } from '../socket';

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  login: (u: string, p: string) => Promise<void>;
  register: (u: string, p: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);
const TOKEN_KEY = 'jeopardy.token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // On boot: validate a stored token and (if good) connect the socket.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { user: AuthUser }) => {
        setUser(data.user);
        connectSocket(token);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setReady(true));
  }, []);

  const finish = useCallback((data: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    connectSocket(data.token);
  }, []);

  const submit = useCallback(
    async (path: string, username: string, password: string) => {
      const res = await fetch(`/api/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      finish(data as AuthResponse);
    },
    [finish]
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      login: (u, p) => submit('login', u, p),
      register: (u, p) => submit('register', u, p),
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('jeopardy.lastRoom');
        setUser(null);
        disconnectSocket();
      },
    }),
    [user, ready, submit]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
