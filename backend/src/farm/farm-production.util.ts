export const HOUR_MS = 3_600_000;

export interface ProductionRates {
  [resource: string]: number;
}

export interface ProductionInput {
  productionRate: ProductionRates;
  storageCapacity: number;
  lastCollectedAt: Date;
  boostExpiresAt: Date | null;
  boostMultiplier: number;
  atTime: Date;
}

export interface ProductionResult {
  produced: Record<string, number>;
  wasCapped: boolean;
}

/**
 * Formula pura de produccion idle, sin dependencias de Prisma/Nest: cuanto se
 * genero de cada recurso entre `lastCollectedAt` y `atTime`, con el boost
 * prorrateado segun su solapamiento real con esa ventana, recortado
 * proporcionalmente si el total excede `storageCapacity` (silo lleno = se
 * pierde el resto, como en Hay Day).
 *
 * Extraida de FarmService para que WorkerService pueda reusarla tal cual al
 * simular multiples "cosechas" virtuales durante el calculo de ganancias
 * offline del peon — una sola fuente de verdad para la matematica de
 * produccion, en vez de dos formulas que podrian divergir con el tiempo.
 */
export function computeProduction(input: ProductionInput): ProductionResult {
  const elapsedMs = Math.max(0, input.atTime.getTime() - input.lastCollectedAt.getTime());

  const boostEndMs =
    input.boostExpiresAt && input.boostExpiresAt.getTime() > input.lastCollectedAt.getTime()
      ? Math.min(input.boostExpiresAt.getTime(), input.atTime.getTime())
      : input.lastCollectedAt.getTime();
  const boostedMs = Math.max(0, boostEndMs - input.lastCollectedAt.getTime());
  const normalMs = elapsedMs - boostedMs;

  const raw: Record<string, number> = {};
  let totalRaw = 0;
  for (const [resource, rate] of Object.entries(input.productionRate)) {
    const amount = rate * (normalMs / HOUR_MS) + rate * input.boostMultiplier * (boostedMs / HOUR_MS);
    raw[resource] = amount;
    totalRaw += amount;
  }

  const scale = totalRaw > input.storageCapacity && totalRaw > 0 ? input.storageCapacity / totalRaw : 1;

  const produced: Record<string, number> = {};
  for (const [resource, amount] of Object.entries(raw)) {
    produced[resource] = amount * scale;
  }

  return { produced, wasCapped: scale < 1 };
}
