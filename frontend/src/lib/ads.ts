import { useCallback, useEffect, useRef } from 'react';

const SIMULATED_AD_SECONDS = 5;

/**
 * Stand-in para cuando no hay un VITE_ADSGRAM_BLOCK_ID configurado (dev, o
 * produccion mientras el block sigue en moderacion). Nunca se acredita nada
 * de verdad con esto en produccion: POST /ads/simulate se autodeshabilita
 * con NODE_ENV=production (ver ads.controller.ts).
 */
export function playSimulatedAd(onTick?: (secondsLeft: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let secondsLeft = SIMULATED_AD_SECONDS;
    onTick?.(secondsLeft);

    const interval = setInterval(() => {
      secondsLeft -= 1;
      onTick?.(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
}

export interface AdgramShowResult {
  done: boolean;
  description: string;
  state: 'load' | 'render' | 'playing' | 'destroy';
  error: boolean;
}

interface AdgramController {
  show(): Promise<AdgramShowResult>;
  destroy(): void;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
}

declare global {
  interface Window {
    Adsgram?: {
      init(options: { blockId: string; debug?: boolean }): AdgramController;
    };
  }
}

/**
 * Puerto a TS/hook del ejemplo oficial de Adsgram (ver
 * docs.adsgram.ai/publisher/reward-interstitial-code-examples). show()
 * resuelve solo si el usuario miro el anuncio hasta el final; en cualquier
 * otro caso (lo salteo, no habia banner, error de red) rechaza.
 *
 * OJO: que esto resuelva NO significa que ya se acredito la recompensa -
 * Adsgram confirma el reward con un GET server-a-server independiente a
 * GET /ads/webhook (ver ads.controller.ts), nunca confiamos en que el
 * cliente "diga" que vio el anuncio para acreditar nada.
 */
export function useAdsgram(blockId: string | undefined) {
  const controllerRef = useRef<AdgramController | undefined>(undefined);

  useEffect(() => {
    if (!blockId) return;
    controllerRef.current = window.Adsgram?.init({ blockId });
    return () => controllerRef.current?.destroy();
  }, [blockId]);

  return useCallback((): Promise<AdgramShowResult> => {
    if (!controllerRef.current) {
      return Promise.reject({
        error: true,
        done: false,
        state: 'load',
        description: 'Adsgram script not loaded',
      } satisfies AdgramShowResult);
    }
    return controllerRef.current.show();
  }, []);
}
