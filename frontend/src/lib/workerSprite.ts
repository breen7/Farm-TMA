export type WorkerAnimState = 'idle' | 'walking-to-field' | 'harvesting' | 'walking-to-market' | 'selling';

export interface WorkerSpriteOptions {
  time: number;
  state: WorkerAnimState;
  facingRight: boolean;
  /** Cuanto lleva cargado en la canasta ahora mismo, 0..1 — sube durante 'harvesting', baja durante 'selling'. */
  loadFraction: number;
}

/**
 * Peon dibujado a mano en Canvas, mismo espiritu que farmSprites.ts (sin
 * assets de imagen externos). A diferencia de esos sprites estaticos, este
 * recibe `time` + `state` para animar el paso al caminar y el balanceo de
 * brazos al cosechar/vender — la canasta se llena/vacia segun `loadFraction`
 * para que se note visualmente que carga algo real, no solo que se mueve.
 */
export function drawWorkerSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
  opts: WorkerSpriteOptions,
) {
  const { time, state, facingRight, loadFraction } = opts;
  const walking = state === 'walking-to-field' || state === 'walking-to-market';
  const working = state === 'harvesting' || state === 'selling';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(facingRight ? 1 : -1, 1);

  const stridePhase = time / 130;
  const stride = walking ? Math.sin(stridePhase) : working ? Math.sin(time / 90) * 0.35 : 0;
  const bob = walking
    ? Math.abs(Math.sin(stridePhase)) * size * 0.05
    : working
      ? Math.abs(Math.sin(time / 90)) * size * 0.03
      : Math.sin(time / 500) * size * 0.015;
  ctx.translate(0, -bob);

  // Sombra en el piso, fija (no sube con el bob).
  ctx.save();
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.52 + bob, size * 0.26, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Piernas.
  ctx.strokeStyle = '#4a3420';
  ctx.lineWidth = Math.max(1, size * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-size * 0.09, size * 0.08);
  ctx.lineTo(-size * 0.09 + stride * size * 0.14, size * 0.46);
  ctx.moveTo(size * 0.09, size * 0.08);
  ctx.lineTo(size * 0.09 - stride * size * 0.14, size * 0.46);
  ctx.stroke();

  // Canasta en la espalda (detras del cuerpo), se dibuja antes para que el torso la tape parcialmente.
  const basketCx = -size * 0.06;
  const basketCy = size * 0.02;
  ctx.strokeStyle = '#8a5a2e';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.ellipse(basketCx, basketCy, size * 0.13, size * 0.11, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (loadFraction > 0.01) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(basketCx, basketCy, size * 0.115, size * 0.095, 0, 0, Math.PI * 2);
    ctx.clip();
    const fillHeight = size * 0.19 * Math.min(loadFraction, 1);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(basketCx - size * 0.14, basketCy + size * 0.1 - fillHeight, size * 0.28, fillHeight);
    ctx.restore();
  }

  // Torso (tunica).
  ctx.fillStyle = '#c9793a';
  ctx.beginPath();
  ctx.moveTo(-size * 0.21, size * 0.1);
  ctx.lineTo(-size * 0.15, -size * 0.22);
  ctx.lineTo(size * 0.15, -size * 0.22);
  ctx.lineTo(size * 0.21, size * 0.1);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#7a4a1e';
  ctx.fillRect(-size * 0.19, 0, size * 0.38, size * 0.05);

  // Brazos: balanceo opuesto a las piernas al caminar, gesto de cosechar/vender al trabajar.
  const armSwing = walking ? -stride * 0.35 : working ? Math.sin(time / 110) * 0.5 : 0;
  ctx.strokeStyle = '#c9793a';
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(-size * 0.17, -size * 0.08);
  ctx.lineTo(-size * 0.27 + armSwing * size * 0.12, size * 0.08 - Math.abs(armSwing) * size * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.17, -size * 0.08);
  ctx.lineTo(size * 0.27 - armSwing * size * 0.12, size * 0.08 - Math.abs(armSwing) * size * 0.1);
  ctx.stroke();

  // Cabeza + sombrero de paja.
  ctx.fillStyle = '#e8b184';
  ctx.beginPath();
  ctx.arc(0, -size * 0.34, size * 0.14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e0c068';
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.42, size * 0.21, size * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -size * 0.46, size * 0.11, Math.PI, 0);
  ctx.fill();

  ctx.restore();
}
