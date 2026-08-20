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

export interface AnimalTierConfig {
  /** Tasa de produccion por hora en cada tier (indice 0 = tier 1, el inicial). */
  ratesPerHour: number[];
  /** Costo en Coins para subir DESDE cada tier (indice 0 = costo tier1->tier2). */
  upgradeCostsCoins: number[];
}

/**
 * Solo animales (eggs=gallinas, milk=vacas) tienen tiers - wheat es un
 * cultivo, no un animal, y queda fuera de este sistema por ahora. Las tasas
 * y costos estan pensados para que cada upgrade se recupere en un rango de
 * ~25-80h de juego pasivo (ver el analisis de payback en el PR que agrego
 * esto), una curva de progresion de mediano plazo tipica de un idle game -
 * ni trivial ni eterna.
 */
export const ANIMAL_TIERS: Record<string, AnimalTierConfig> = {
  eggs: {
    ratesPerHour: [0.5, 1.1, 2.4],
    upgradeCostsCoins: [300, 900],
  },
  milk: {
    ratesPerHour: [0.2, 0.45, 1.0],
    upgradeCostsCoins: [800, 2200],
  },
};
