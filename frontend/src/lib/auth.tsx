import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { getStartParam } from './telegram';
import type { AuthResponse } from '../types';

interface AuthState {
  user: AuthResponse | null;
  error: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  /** Vuelve a llamar a /auth/telegram (idempotente) para refrescar balances tras una accion. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  error: null,
  loading: true,
  refresh: async () => {},
});

/**
 * Hace el login/registro real contra el backend al montar la app, reenviando
 * el `start_param` de Telegram si la app se abrio via un link de referido.
 * Sin esto, un usuario nuevo nunca queda vinculado a quien lo invito, y
 * ningun endpoint autenticado funciona (el usuario no existe todavia en la
 * base — TelegramAuthGuard valida la firma pero no crea filas).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, error: null, loading: true });

  const login = useCallback(async () => {
    const startParam = getStartParam();
    const path = startParam ? `/auth/telegram?startapp=${encodeURIComponent(startParam)}` : '/auth/telegram';
    try {
      const user = await api.post<AuthResponse>(path);
      setState({ user, error: null, loading: false });
    } catch (err) {
      setState({ user: null, error: (err as Error).message, loading: false });
    }
  }, []);

  useEffect(() => {
    login();
  }, [login]);

  return <AuthContext.Provider value={{ ...state, refresh: login }}>{children}</AuthContext.Provider>;
}

export function useCurrentUser(): AuthContextValue {
  return useContext(AuthContext);
}
