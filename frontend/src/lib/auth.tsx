import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { getStartParam } from './telegram';
import type {
  AuthResponse,
  BootstrapState,
  FarmState,
  InventoryEntry,
  ReferralTree,
  TaskEntry,
  WithdrawalRequestEntry,
  WorkerState,
} from '../types';

const CACHE_KEY = 'farm-tma:bootstrap:v1';
// Cuanto puede envejecer el bootstrap antes de que una vista lo refresque en
// segundo plano al activarse (cambio de tab) — sin esto, los datos quedan
// pegados al ultimo fetch y nunca reflejan cambios que pasaron server-side
// sin una accion nuestra (ej. un retiro que un admin aprobo mientras
// estabamos en otra pestaña).
const STALE_AFTER_MS = 10_000;

interface AppState {
  user: AuthResponse | null;
  farm: FarmState | null;
  inventory: InventoryEntry[] | null;
  tasks: TaskEntry[] | null;
  referrals: ReferralTree | null;
  withdrawals: WithdrawalRequestEntry[] | null;
  worker: WorkerState | null;
  loading: boolean;
  /** true mientras se muestran datos de un bootstrap anterior (cache local) sin confirmar todavia contra el servidor. */
  stale: boolean;
  error: string | null;
}

interface AppStateContextValue extends AppState {
  /** Login/registro (+ captura de start_param) y bootstrap completo. Se corre una sola vez al montar. */
  refresh: () => Promise<void>;
  /** Vuelve a pedir GET /me/state (balances + granja + inventario + tareas + referidos + retiros + peon) en un solo request. Usar despues de cualquier accion que pueda haber cambiado algo de eso. */
  refetch: () => Promise<void>;
  /** GET /farm liviano — lo usa el polling de 5s de la vista Granja para no repetir todo el bootstrap constantemente. */
  refetchFarm: () => Promise<void>;
  /** Si el ultimo fetch tiene mas de STALE_AFTER_MS, dispara `refetch()` en segundo plano (no toca `loading`). Las vistas lo llaman al activarse. */
  refetchIfStale: () => void;
  /** Limpia worker.lastPayout despues de mostrar el toast de "ganancias mientras no estabas" una vez, para que no reaparezca en re-renders ni quede pegado en cache. */
  clearWorkerPayout: () => void;
}

const emptyState: AppState = {
  user: null,
  farm: null,
  inventory: null,
  tasks: null,
  referrals: null,
  withdrawals: null,
  worker: null,
  loading: true,
  stale: false,
  error: null,
};

const AppStateContext = createContext<AppStateContextValue>({
  ...emptyState,
  refresh: async () => {},
  refetch: async () => {},
  refetchFarm: async () => {},
  refetchIfStale: () => {},
  clearWorkerPayout: () => {},
});

function readCache(): BootstrapState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as BootstrapState) : null;
  } catch {
    return null;
  }
}

/**
 * `worker.lastPayout` solo tiene sentido en la respuesta que efectivamente
 * acaba de procesar ciclos offline — persistirlo tal cual haria que, al
 * reabrir la app y sembrar el render desde este cache, el toast de "ganancias
 * mientras no estabas" reaparezca con un numero viejo. Se guarda siempre en
 * null; el valor real solo vive en el estado en memoria de esta sesion.
 */
function writeCache(data: BootstrapState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, worker: { ...data.worker, lastPayout: null } }));
  } catch {
    // Cache es solo una optimizacion de UI, no critico si el storage esta lleno/no disponible.
  }
}

/**
 * Unico proveedor de estado de la app: hace el login/registro real contra el
 * backend al montar (reenviando el `start_param` de Telegram si la app se
 * abrio via un link de referido) y trae de entrada TODO lo que necesitan las
 * 4 pestañas en un solo GET /me/state, en vez de que cada vista pida sus
 * propios datos al montarse. Ademas siembra el primer render con lo ultimo
 * que se guardo en localStorage (si existe) para que la UI aparezca al
 * instante — incluso reabriendo la app despues de cerrarla del todo — y
 * reconcilia con el servidor en segundo plano.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    const cached = readCache();
    return cached ? { ...cached, loading: false, stale: true, error: null } : emptyState;
  });
  const lastFetchedAtRef = useRef(0);
  const refreshInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const startParam = getStartParam();
      const authPath = startParam ? `/auth/telegram?startapp=${encodeURIComponent(startParam)}` : '/auth/telegram';
      // El login/registro (+ captura de referido) tiene que resolver primero:
      // un usuario nuevo no tiene fila de Farm todavia y /me/state fallaria.
      await api.post<AuthResponse>(authPath);
      const bootstrap = await api.get<BootstrapState>('/me/state');
      writeCache(bootstrap);
      lastFetchedAtRef.current = Date.now();
      setState({ ...bootstrap, loading: false, stale: false, error: null });
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: (err as Error).message }));
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const refetch = useCallback(async () => {
    try {
      const bootstrap = await api.get<BootstrapState>('/me/state');
      writeCache(bootstrap);
      lastFetchedAtRef.current = Date.now();
      setState((prev) => ({ ...prev, ...bootstrap, stale: false, error: null }));
    } catch (err) {
      setState((prev) => ({ ...prev, error: (err as Error).message }));
    }
  }, []);

  const refetchFarm = useCallback(async () => {
    try {
      const farm = await api.get<FarmState>('/farm');
      setState((prev) => {
        const next = { ...prev, farm, stale: false };
        // Mantiene la cache consistente con lo ultimo mostrado, no solo con
        // lo que trajo el ultimo /me/state completo.
        if (next.user && next.inventory && next.tasks && next.referrals && next.withdrawals && next.worker) {
          writeCache({
            user: next.user,
            farm,
            inventory: next.inventory,
            tasks: next.tasks,
            referrals: next.referrals,
            withdrawals: next.withdrawals,
            worker: next.worker,
          });
        }
        return next;
      });
    } catch (err) {
      // El polling de 5s no debe tirar un banner de error por un blip de red transitorio.
      console.error('refetchFarm failed', err);
    }
  }, []);

  const refetchIfStale = useCallback(() => {
    if (Date.now() - lastFetchedAtRef.current > STALE_AFTER_MS) {
      refetch();
    }
  }, [refetch]);

  const clearWorkerPayout = useCallback(() => {
    setState((prev) => (prev.worker?.lastPayout ? { ...prev, worker: { ...prev.worker, lastPayout: null } } : prev));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AppStateContext.Provider value={{ ...state, refresh, refetch, refetchFarm, refetchIfStale, clearWorkerPayout }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  return useContext(AppStateContext);
}
