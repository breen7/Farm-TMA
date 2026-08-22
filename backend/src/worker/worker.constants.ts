export interface WorkerTierConfig {
  /** Metros por segundo — determina cuanto dura cada viaje parcela↔mercado. */
  walkSpeedMPerSec: number;
  /** Unidades totales (sumadas entre recursos) que puede cargar por viaje. */
  inventoryCapacity: number;
  /** Costo en Coins para llegar a ESTE tier desde el anterior (indice 0 = costo de desbloqueo, tier 0->1). */
  upgradeCostCoins: number;
}

/**
 * Curva de progresion del peon, mismo patron que ANIMAL_TIERS en
 * farm.constants.ts: valores fijos por diseño en vez de una tabla en DB, para
 * poder rebalancear sin migracion. `level` en el modelo Worker es el indice
 * 1-based dentro de este array (level 0 = no desbloqueado, sin fila de tier).
 */
export const WORKER_TIERS: WorkerTierConfig[] = [
  { walkSpeedMPerSec: 1.2, inventoryCapacity: 20, upgradeCostCoins: 150 },
  { walkSpeedMPerSec: 1.6, inventoryCapacity: 35, upgradeCostCoins: 400 },
  { walkSpeedMPerSec: 2.2, inventoryCapacity: 60, upgradeCostCoins: 1000 },
];

/** Distancia de ida y vuelta entre la parcela y el mercado, en metros (valor de diseño, no una unidad real del mapa). */
export const WORKER_ROUND_TRIP_DISTANCE_M = 40;

/** Tiempo fijo de cosechar+vender por viaje, ademas del tiempo de caminata. */
export const WORKER_HANDLING_TIME_SEC = 5;

/** Tope de horas offline que se procesan de una sola vez — evita simular semanas de golpe si el jugador no abre la app. */
export const WORKER_MAX_OFFLINE_HOURS = 12;
