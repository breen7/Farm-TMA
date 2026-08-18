/**
 * Debe coincidir con backend/src/farm/farm.constants.ts. Solo se usa para
 * mostrar una estimacion antes de vender — el monto real acreditado siempre
 * viene de la respuesta del backend, nunca se confia en este valor para nada
 * que afecte balances.
 */
export const RESOURCE_SELL_PRICES: Record<string, number> = {
  wheat: 10,
  eggs: 20,
  milk: 50,
};
