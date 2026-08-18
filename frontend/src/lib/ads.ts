const SIMULATED_AD_SECONDS = 5;

/**
 * Stand-in por el SDK real de Adsgram/Monetag mientras no tenemos cuentas de
 * esas redes. Cuando lleguen, reemplazar el cuerpo de esta funcion por
 * `window.Adsgram.init({ blockId }).show()` (o el equivalente de Monetag) —
 * el resto del flujo (llamar a /ads/simulate, refrescar el balance) no
 * deberia necesitar cambios, ya que ambos casos terminan en una promesa que
 * resuelve cuando el anuncio termino de reproducirse.
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
