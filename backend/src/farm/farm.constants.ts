/**
 * Precios de venta en Coins por unidad. Fijados inversamente proporcionales
 * a productionRate por defecto (wheat:1, eggs:0.5, milk:0.2 por hora) para
 * que cada recurso rinda ~10 coins/hora vendido — sin esto, milk (la tasa
 * mas baja) seria estrictamente peor que wheat en vez de una alternativa
 * mas lenta pero igual de valiosa.
 */
export const RESOURCE_SELL_PRICES: Record<string, number> = {
  wheat: 10,
  eggs: 20,
  milk: 50,
};
