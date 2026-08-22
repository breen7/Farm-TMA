/**
 * Debe coincidir con backend/src/worker/worker.constants.ts. Solo se usa
 * para repartir el `cycleDurationSec` que devuelve el backend entre las
 * fases de la animacion (cuanto dura caminar vs. cosechar/vender) — nunca
 * afecta cuanto realmente gana el peon, eso lo calcula siempre el backend.
 */
export const WORKER_HANDLING_TIME_SEC = 5;
