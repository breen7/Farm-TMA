import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { api, ApiError } from '../api/client';
import { playSimulatedAd, useAdsgram } from '../lib/ads';
import { useAppState } from '../lib/auth';
import { buildDepositTransaction } from '../lib/deposits';
import { getResourceAccentColor, getResourceSprite } from '../lib/farmSprites';
import { WORKER_HANDLING_TIME_SEC } from '../lib/workerEconomy';
import { drawWorkerSprite, type WorkerAnimState } from '../lib/workerSprite';
import { ArrowUpIcon, BasketIcon, BoltIcon, PlayIcon, WorkerIcon } from '../lib/icons';
import type { AdRewardResult, CollectResult, DepositIntent, WorkerState } from '../types';

const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID || '';

const DEPOSIT_POLL_INTERVAL_MS = 3000;
const DEPOSIT_MAX_POLLS = 40; // ~2 minutos de polling activo; el backend sigue verificando aunque el frontend deje de preguntar

const TEXT_DURATION_MS = 1100;
const PARTICLE_DURATION_MS = 700;
const PARTICLE_COUNT = 8;

/** Onda decorativa determinista por recurso — es flavor visual, no un grafico de datos reales. */
function Sparkline({ resource, color }: { resource: string; color: string }) {
  let seed = 0;
  for (let i = 0; i < resource.length; i++) seed = (seed * 31 + resource.charCodeAt(i)) % 1000;
  const points = Array.from({ length: 8 }, (_, i) => {
    const n = Math.sin(seed + i * 1.7) * 0.5 + 0.5;
    return `${(i / 7) * 60},${14 - n * 10}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 60 14" className="h-3.5 w-14" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface PlotCardProps {
  resource: string;
  rate: number;
  pending: number;
  capped: boolean;
}

export interface PlotCardHandle {
  celebrate: (amount: number) => void;
}

interface HarvestEffect {
  amount: number;
  startTime: number;
  particles: { angle: number; speed: number }[];
}

/**
 * Cada plot es una tarjeta DOM propia (antes eran celdas pintadas dentro de
 * un unico canvas compartido). El canvas interno sigue siendo chico y
 * dedicado solo al sprite animado (madurez/bob/pulso) y al efecto de
 * cosecha de ESE recurso — el ref imperativo evita que un re-render de
 * React tenga que orquestar la animacion frame a frame.
 */
const PlotCard = forwardRef<PlotCardHandle, PlotCardProps>(function PlotCard(
  { resource, rate, pending, capped },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef({ rate, pending });
  const effectsRef = useRef<HarvestEffect[]>([]);

  useEffect(() => {
    dataRef.current = { rate, pending };
  }, [rate, pending]);

  useImperativeHandle(ref, () => ({
    celebrate(amount) {
      effectsRef.current.push({
        amount,
        startTime: performance.now(),
        particles: Array.from({ length: PARTICLE_COUNT }, () => ({
          angle: Math.random() * Math.PI * 2,
          speed: 40 + Math.random() * 60,
        })),
      });
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (time: number) => {
      const { rate, pending } = dataRef.current;
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      // "Madurez": cuanto de una hora de produccion ya se acumulo.
      const ripeness = rate > 0 ? Math.min(pending / rate, 1) : 0;
      const scale = 0.5 + ripeness * 0.5;
      const alpha = 0.55 + ripeness * 0.45;
      const bob = Math.sin(time / 500) * 3 * (0.4 + ripeness * 0.6);
      const size = Math.min(width, height) * 0.55 * scale;
      const cx = width / 2;
      const cy = height / 2 + bob;

      if (ripeness >= 1) {
        const pulse = (Math.sin(time / 300) + 1) / 2;
        ctx.save();
        ctx.globalAlpha = 0.15 + pulse * 0.2;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      getResourceSprite(resource)(ctx, cx, cy, size, alpha);
      ctx.restore();

      const now = performance.now();
      effectsRef.current = effectsRef.current.filter((effect) => now - effect.startTime < TEXT_DURATION_MS);
      const color = getResourceAccentColor(resource);

      for (const effect of effectsRef.current) {
        const elapsed = now - effect.startTime;

        if (elapsed < PARTICLE_DURATION_MS) {
          const t = elapsed / 1000;
          ctx.save();
          ctx.globalAlpha = 1 - elapsed / PARTICLE_DURATION_MS;
          ctx.fillStyle = color;
          for (const particle of effect.particles) {
            const px = cx + Math.cos(particle.angle) * particle.speed * t;
            const py = cy + Math.sin(particle.angle) * particle.speed * t - 20 * t;
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        const textProgress = elapsed / TEXT_DURATION_MS;
        ctx.save();
        ctx.globalAlpha = Math.max(1 - textProgress, 0);
        ctx.fillStyle = color;
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 3;
        ctx.fillText(`+${effect.amount.toFixed(2)}`, cx, cy - 20 - textProgress * 40);
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [resource]);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-[#3a2817] to-[#24170c] ${
        capped ? 'border-amber-400/70' : 'border-[#4a3420]'
      }`}
    >
      <canvas ref={canvasRef} className="h-20 w-full sm:h-24" />
      <div className="mx-2 mb-2 rounded-xl bg-black/40 p-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-farm-text-dim">Production Rate</p>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <span className="text-sm font-semibold text-farm-text">{rate.toFixed(2)}/h</span>
          <Sparkline resource={resource} color={getResourceAccentColor(resource)} />
        </div>
      </div>
    </div>
  );
});

interface FarmPlotsProps {
  productionRate: Record<string, number>;
  pendingProduction: Record<string, number>;
  level: number;
  pendingIsCapped: boolean;
}

export interface FarmPlotsHandle {
  /** Dispara numeros flotantes + particulas en la tarjeta de cada recurso cosechado. */
  celebrateCollect: (collected: Record<string, number>) => void;
}

/**
 * La cantidad de tarjetas crece con el nivel (mismo criterio que antes,
 * cuando esto era una grilla pintada en un solo canvas): mas plots
 * desbloqueados reciclan los mismos tipos de recurso en vez de introducir
 * nuevos.
 */
const FarmPlots = forwardRef<FarmPlotsHandle, FarmPlotsProps>(function FarmPlots(
  { productionRate, pendingProduction, level, pendingIsCapped },
  ref,
) {
  const resources = Object.keys(productionRate);
  const cols = Math.min(4, level + 1);
  const plotCount = Math.max(cols, resources.length, 1);
  const plotResources =
    resources.length > 0 ? Array.from({ length: plotCount }, (_, i) => resources[i % resources.length]) : [];

  const cardRefs = useRef<Record<number, PlotCardHandle | null>>({});

  useImperativeHandle(ref, () => ({
    celebrateCollect(collected) {
      for (const [resource, amount] of Object.entries(collected)) {
        if (amount <= 0.001) continue;
        const idx = plotResources.indexOf(resource);
        if (idx === -1) continue;
        cardRefs.current[idx]?.celebrate(amount);
      }
    },
  }));

  if (plotResources.length === 0) return null;

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {plotResources.map((resource, i) => (
        <PlotCard
          key={i}
          ref={(handle) => {
            cardRefs.current[i] = handle;
          }}
          resource={resource}
          rate={productionRate[resource] ?? 0}
          pending={pendingProduction[resource] ?? 0}
          capped={pendingIsCapped}
        />
      ))}
    </div>
  );
});

const WORKER_LANE_PADDING = 22;

/**
 * Panel del Peón: contratar/mejorar/activar, y el carril animado que lo
 * muestra caminando entre la parcela y el mercado. La animación es un reloj
 * cosmético propio en el cliente (nunca decide cuanto gana el peon, eso
 * siempre lo calcula `WorkerService.processOfflineEarnings` en el backend) —
 * pero esta sincronizada al `cycleDurationSec` real que devuelve la API, asi
 * que el ritmo visual no miente sobre el ritmo economico real.
 */
function WorkerPanel() {
  const { worker, refetch } = useAppState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef({ enabled: false, unlocked: false, cycleDurationSec: 30 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dataRef.current = {
      enabled: worker?.enabled ?? false,
      unlocked: worker?.unlocked ?? false,
      cycleDurationSec: worker?.cycleDurationSec ?? 30,
    };
  }, [worker?.enabled, worker?.unlocked, worker?.cycleDurationSec]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const startTime = performance.now();

    const draw = (time: number) => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      const { enabled, unlocked, cycleDurationSec } = dataRef.current;
      const laneLeft = WORKER_LANE_PADDING;
      const laneRight = width - WORKER_LANE_PADDING;
      const laneY = height * 0.62;
      const spriteSize = height * 0.62;

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(laneLeft, laneY);
      ctx.lineTo(laneRight, laneY);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = `${height * 0.34}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = unlocked && enabled ? 0.9 : 0.4;
      ctx.fillText('🌾', laneLeft, laneY);
      ctx.fillText('🪙', laneRight, laneY);
      ctx.restore();

      if (!unlocked) {
        drawWorkerSprite(ctx, (laneLeft + laneRight) / 2, laneY, spriteSize, 0.3, {
          time,
          state: 'idle',
          facingRight: true,
          loadFraction: 0,
        });
      } else if (!enabled) {
        drawWorkerSprite(ctx, laneLeft + 20, laneY, spriteSize, 0.55, {
          time,
          state: 'idle',
          facingRight: true,
          loadFraction: 0,
        });
      } else {
        const cycleMs = Math.max(cycleDurationSec, 4) * 1000;
        const handlingMs = Math.min(WORKER_HANDLING_TIME_SEC * 1000, cycleMs * 0.6);
        const walkEachMs = (cycleMs - handlingMs) / 2;
        const handleEachMs = handlingMs / 2;
        const elapsed = (time - startTime) % cycleMs;

        let animState: WorkerAnimState;
        let laneProgress: number; // 0 = en la parcela, 1 = en el mercado
        let loadFraction: number;

        if (elapsed < walkEachMs) {
          animState = 'walking-to-field';
          laneProgress = 1 - elapsed / walkEachMs;
          loadFraction = 0;
        } else if (elapsed < walkEachMs + handleEachMs) {
          animState = 'harvesting';
          laneProgress = 0;
          loadFraction = (elapsed - walkEachMs) / handleEachMs;
        } else if (elapsed < walkEachMs * 2 + handleEachMs) {
          animState = 'walking-to-market';
          laneProgress = (elapsed - walkEachMs - handleEachMs) / walkEachMs;
          loadFraction = 1;
        } else {
          animState = 'selling';
          laneProgress = 1;
          loadFraction = 1 - (elapsed - walkEachMs * 2 - handleEachMs) / handleEachMs;
        }

        const facingRight = animState === 'walking-to-market' || animState === 'selling';
        const spriteX = laneLeft + (laneRight - laneLeft) * laneProgress;

        drawWorkerSprite(ctx, spriteX, laneY, spriteSize, 1, { time, state: animState, facingRight, loadFraction });
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (!worker) return null;

  const runAction = async (action: () => Promise<unknown>, fallbackMessage: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallbackMessage);
    } finally {
      setBusy(false);
    }
  };

  const unlock = () => runAction(() => api.post<WorkerState>('/worker/unlock'), 'No se pudo contratar al peón.');
  const upgrade = () => runAction(() => api.post<WorkerState>('/worker/upgrade'), 'No se pudo mejorar al peón.');
  const toggle = () =>
    runAction(() => api.patch<WorkerState>('/worker', { enabled: !worker.enabled }), 'No se pudo cambiar el estado del peón.');

  return (
    <div className="rounded-2xl border border-farm-border bg-gradient-to-b from-farm-surface-hi to-farm-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 text-farm-text-dim">
            <WorkerIcon />
          </span>
          <div>
            <p className="text-sm font-semibold text-farm-text">Peón{worker.unlocked ? ` · Nivel ${worker.level}` : ''}</p>
            {worker.unlocked && (
              <p className="text-xs text-farm-text-dim">
                {worker.walkSpeedMPerSec?.toFixed(1)} m/s · carga {worker.inventoryCapacity} · {worker.cycleDurationSec?.toFixed(0)}s/viaje
              </p>
            )}
          </div>
        </div>
        {worker.unlocked && (
          <button
            onClick={toggle}
            disabled={busy}
            aria-label={worker.enabled ? 'Desactivar peón' : 'Activar peón'}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              worker.enabled ? 'bg-farm-primary' : 'bg-black/40'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                worker.enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="mt-3 h-20 w-full" />

      {error && <p className="mt-2 text-sm text-farm-danger">{error}</p>}

      {!worker.unlocked ? (
        <button
          onClick={unlock}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-farm-accent py-2 text-sm font-semibold text-farm-bg disabled:opacity-50"
        >
          <WorkerIcon />
          Contratar peón ({worker.nextUpgradeCost} coins)
        </button>
      ) : worker.nextUpgradeCost !== null ? (
        <button
          onClick={upgrade}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/80 py-2 text-sm font-semibold text-amber-300 disabled:opacity-50"
        >
          <ArrowUpIcon />
          Mejorar ({worker.nextUpgradeCost} coins)
        </button>
      ) : (
        <p className="mt-3 text-center text-xs text-farm-text-dim">Nivel máximo</p>
      )}
    </div>
  );
}

/** Tiempo estimado hasta que el postback server-a-server de Adsgram nos llega y acredita la recompensa. */
const AD_CREDIT_GRACE_MS = 4000;

function AdSimulator({ onRewarded }: { onRewarded: () => Promise<void> }) {
  const [status, setStatus] = useState<'idle' | 'playing' | 'confirming' | 'reward' | 'error' | 'unavailable'>('idle');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [rewardBalance, setRewardBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showRealAd = useAdsgram(ADSGRAM_BLOCK_ID || undefined);

  /**
   * Camino real: Adsgram confirma el reward con un GET server-a-server
   * independiente (ver GET /ads/webhook en el backend), nunca porque el
   * cliente "diga" que vio el anuncio. show() resolviendo solo significa que
   * el usuario miro el anuncio completo — despues hay que esperar un rato a
   * que el postback llegue y recien ahi refrescar el balance.
   *
   * Si show() rechaza (ej. el block todavia esta en moderacion: "Block X is
   * not active"), en produccion no tiene sentido invitar a "reintentar" — el
   * simulador tambien esta bloqueado ahi (NODE_ENV=production), asi que no
   * hay ningun camino que vaya a funcionar hasta que Adsgram apruebe el
   * block. Mostramos el mismo estado neutro que cuando no hay block
   * configurado, en vez de un error que sugiere que algo esta roto. En dev
   * mostramos el error real, para poder debuggear el SDK.
   */
  const watchRealAd = async () => {
    setError(null);
    setStatus('playing');
    try {
      await showRealAd();
      setStatus('confirming');
      await new Promise((resolve) => setTimeout(resolve, AD_CREDIT_GRACE_MS));
      await onRewarded();
      setStatus('reward');
    } catch (err) {
      if (import.meta.env.PROD) {
        setStatus('unavailable');
      } else {
        setError(`SDK de Adsgram: ${JSON.stringify(err)}`);
        setStatus('error');
      }
    }
  };

  /** Camino simulado (dev, o produccion mientras el block real sigue en moderacion). */
  const watchSimulatedAd = async () => {
    setError(null);
    setStatus('playing');
    await playSimulatedAd(setSecondsLeft);
    try {
      const result = await api.post<AdRewardResult>('/ads/simulate', { network: 'adsgram' });
      setRewardBalance(result.bucksBalance);
      setStatus('reward');
      await onRewarded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo acreditar la recompensa.');
      setStatus('error');
    }
  };

  const watchAd = ADSGRAM_BLOCK_ID ? watchRealAd : watchSimulatedAd;

  // Sin block real configurado (o configurado pero fallando, ej. en
  // moderacion) y en produccion, /ads/simulate esta bloqueado server-side
  // (NODE_ENV=production) - no hay ningun camino funcional, mejor un estado
  // neutro que un boton que siempre tira error o un popup nativo del SDK.
  if ((!ADSGRAM_BLOCK_ID || status === 'unavailable') && import.meta.env.PROD) {
    return (
      <div className="rounded-2xl bg-[#86b565]/40 p-4">
        <p className="font-bold text-[#1c2b16]">Gana Pulso extra</p>
        <p className="text-sm text-[#1c2b16]/70">Los anuncios reales llegan pronto.</p>
      </div>
    );
  }

  if (status === 'playing' && !ADSGRAM_BLOCK_ID) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90">
        <p className="text-sm text-farm-text-dim">Anuncio simulado (Adsgram)</p>
        <p className="text-6xl font-bold text-farm-primary">{secondsLeft}</p>
        <p className="text-sm text-farm-text-dim">La recompensa se acredita cuando termina</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#86b565] p-4">
      <div>
        <p className="font-bold text-[#1c2b16]">Gana Pulso extra</p>
        {status === 'playing' ? (
          <p className="text-sm text-[#1c2b16]/80">Reproduciendo anuncio...</p>
        ) : status === 'confirming' ? (
          <p className="text-sm text-[#1c2b16]/80">¡Gracias! Acreditando recompensa...</p>
        ) : status === 'reward' && rewardBalance ? (
          <p className="text-sm text-[#1c2b16]/80">Recompensa acreditada · Balance: {rewardBalance} Pulso</p>
        ) : status === 'reward' ? (
          <p className="text-sm text-[#1c2b16]/80">¡Recompensa acreditada!</p>
        ) : status === 'error' && error ? (
          <p className="text-sm text-red-900">{error}</p>
        ) : (
          <p className="text-sm text-[#1c2b16]/80">Mira un anuncio para ganar Pulso al instante</p>
        )}
      </div>
      <button
        onClick={watchAd}
        disabled={status === 'playing' || status === 'confirming'}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-farm-accent px-4 py-2 font-semibold text-[#1c2b16] disabled:opacity-50"
      >
        <PlayIcon />
        Ver anuncio
      </button>
    </div>
  );
}

type DepositBoostStatus = 'idle' | 'creating' | 'waiting-wallet' | 'confirming' | 'confirmed' | 'error' | 'expired';

/**
 * Boost pagado con un deposito TON real via TonConnect, alternativa al boost
 * pagado en Pulso (bucksBalance en la API, sin renombrar por ahora — ver
 * types.ts). El backend nunca confia en que esto "diga" que el pago se
 * hizo: crea una intencion PENDING, nosotros le pedimos a la wallet que
 * mande esa transaccion exacta, y recien confirmamos cuando el backend
 * verifica la transaccion en cadena (polling de GET /deposits/:id).
 */
function DepositBoostButton({ onGranted }: { onGranted: () => void }) {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const [status, setStatus] = useState<DepositBoostStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<DepositIntent | null>(null);

  const pollUntilResolved = async (depositId: string) => {
    for (let i = 0; i < DEPOSIT_MAX_POLLS; i++) {
      await new Promise((resolve) => setTimeout(resolve, DEPOSIT_POLL_INTERVAL_MS));
      const current = await api.get<DepositIntent>(`/deposits/${depositId}`);
      if (current.status === 'CONFIRMED') {
        setStatus('confirmed');
        onGranted();
        return;
      }
      if (current.status === 'EXPIRED' || current.status === 'FAILED') {
        setStatus('expired');
        return;
      }
    }
    setStatus('expired'); // el frontend dejo de preguntar; el sweep del backend lo sigue intentando igual
  };

  const depositForBoost = async () => {
    setError(null);
    setStatus('creating');
    try {
      const newIntent = await api.post<DepositIntent>('/deposits/intent', { network: 'TON', purpose: 'FARM_BOOST' });
      setIntent(newIntent);

      setStatus('waiting-wallet');
      await tonConnectUI.sendTransaction(buildDepositTransaction(newIntent));

      setStatus('confirming');
      await pollUntilResolved(newIntent.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar el deposito.');
      setStatus('error');
    }
  };

  if (!wallet) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-farm-border bg-farm-surface p-4">
        <p className="text-sm text-farm-text-dim">Conecta tu wallet para bostear pagando con TON</p>
        <TonConnectButton />
      </div>
    );
  }

  const busy = status === 'creating' || status === 'waiting-wallet' || status === 'confirming';

  return (
    <div className="rounded-xl border border-farm-border bg-farm-surface p-4">
      <p className="font-medium text-farm-text">Boost con TON</p>
      {status === 'confirmed' ? (
        <p className="mt-1 text-sm text-farm-primary">¡Depósito confirmado! Boost activado.</p>
      ) : status === 'expired' ? (
        <p className="mt-1 text-sm text-farm-accent">El depósito expiró o no se confirmó. Intentá de nuevo.</p>
      ) : status === 'error' && error ? (
        <p className="mt-1 text-sm text-farm-danger">{error}</p>
      ) : (
        <p className="mt-1 text-sm text-farm-text-dim">
          {intent ? `Depósito de ${intent.amount} TON` : 'Pagá con un depósito TON real para bostear al instante'}
        </p>
      )}

      <button
        onClick={depositForBoost}
        disabled={busy}
        className="mt-3 w-full rounded-xl bg-farm-accent py-2 text-sm font-semibold text-farm-bg disabled:opacity-50"
      >
        {status === 'creating' && 'Preparando...'}
        {status === 'waiting-wallet' && 'Confirmá en tu wallet...'}
        {status === 'confirming' && 'Verificando en la blockchain...'}
        {(status === 'idle' || status === 'confirmed' || status === 'error' || status === 'expired') && 'Depositar TON'}
      </button>
    </div>
  );
}

export function FarmView() {
  const { farm: state, worker, error: bootstrapError, refetch, refetchFarm, clearWorkerPayout } = useAppState();
  const [error, setError] = useState<string | null>(null);
  const [workerNotice, setWorkerNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const plotsHandleRef = useRef<FarmPlotsHandle>(null);

  useEffect(() => {
    refetchFarm();
    const interval = setInterval(refetchFarm, 5000);
    return () => clearInterval(interval);
  }, [refetchFarm]);

  // Se dispara cuando /me/state trae un lastPayout fresco (el peon proceso
  // ciclos offline en esta misma respuesta) — clearWorkerPayout lo limpia del
  // estado compartido para que no vuelva a aparecer en el proximo refetch ni
  // quede pegado en el cache local.
  useEffect(() => {
    if (!worker?.lastPayout) return;
    const { coinsEarned, cycles } = worker.lastPayout;
    setWorkerNotice(`Tu peón trabajó mientras no estabas: +${coinsEarned.toFixed(2)} coins (${cycles} viaje${cycles === 1 ? '' : 's'})`);
    clearWorkerPayout();
  }, [worker?.lastPayout, clearWorkerPayout]);

  useEffect(() => {
    if (!workerNotice) return;
    const timeout = setTimeout(() => setWorkerNotice(null), 5000);
    return () => clearTimeout(timeout);
  }, [workerNotice]);

  const collect = async () => {
    setBusy(true);
    try {
      const result = await api.post<CollectResult>('/farm/collect');
      plotsHandleRef.current?.celebrateCollect(result.collected);
      await refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const boost = async () => {
    setBusy(true);
    try {
      await api.post('/farm/boost');
      await refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const boostExpiresAt = state?.boostExpiresAt;
  const boostActive = boostExpiresAt ? new Date(boostExpiresAt).getTime() > Date.now() : false;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="text-lg font-semibold text-farm-text">Granja{state ? ` · Nivel ${state.level}` : ''}</h1>
        {boostActive && boostExpiresAt && (
          <p className="text-sm text-farm-accent">Boost activo hasta {new Date(boostExpiresAt).toLocaleTimeString()}</p>
        )}
      </header>

      {(error || bootstrapError) && (
        <p className="rounded-lg bg-farm-danger/20 p-2 text-sm text-farm-danger">{error ?? bootstrapError}</p>
      )}
      {workerNotice && <p className="rounded-lg bg-farm-primary/20 p-2 text-sm text-farm-primary">{workerNotice}</p>}

      {state && (
        <FarmPlots
          ref={plotsHandleRef}
          productionRate={state.productionRate}
          pendingProduction={state.pendingProduction}
          level={state.level}
          pendingIsCapped={state.pendingIsCapped}
        />
      )}

      <WorkerPanel />

      <AdSimulator onRewarded={refetch} />

      {state && (
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(state.pendingProduction).map(([resource, amount]) => (
            <div key={resource} className="rounded-xl bg-[#1a2e22] p-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-farm-text-dim">{resource}</p>
              <p className="text-lg font-semibold text-[#4ade80]">{amount.toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}

      {state?.pendingIsCapped && (
        <p className="text-sm text-farm-accent">El silo esta lleno: cosecha antes de seguir acumulando.</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={collect}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b6a38] to-[#2e9e54] py-3 font-semibold text-white disabled:opacity-50"
        >
          <BasketIcon />
          Cosechar
        </button>
        <button
          onClick={boost}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/80 py-3 font-semibold text-amber-300 disabled:opacity-50"
        >
          <BoltIcon />
          Activar boost
        </button>
      </div>

      <DepositBoostButton onGranted={refetch} />
    </div>
  );
}
