export type SpriteDrawer = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) => void;

/** Trigo: unos tallos en abanico con una espiga ovalada en la punta de cada uno. */
function drawWheat(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.strokeStyle = '#c98a1f';
  ctx.fillStyle = '#f2c14e';
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.lineCap = 'round';

  for (const angle of [-0.32, 0, 0.32]) {
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.5);
    ctx.lineTo(0, -size * 0.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.52, size * 0.13, size * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Huevo apoyado en un nido (arco de paja debajo). */
function drawEgg(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  ctx.strokeStyle = '#a9773f';
  ctx.lineWidth = Math.max(1, size * 0.09);
  ctx.beginPath();
  ctx.ellipse(0, size * 0.32, size * 0.55, size * 0.18, 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#f4f1e6';
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.02, size * 0.3, size * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Botella de leche: cuerpo trapezoidal, cuello y tapa. */
function drawMilk(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  const w = size * 0.5;
  const h = size * 0.75;

  ctx.fillStyle = '#eaf6ff';
  ctx.strokeStyle = '#8fd3f4';
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, h * 0.5);
  ctx.lineTo(-w * 0.5, -h * 0.05);
  ctx.lineTo(-w * 0.2, -h * 0.45);
  ctx.lineTo(w * 0.2, -h * 0.45);
  ctx.lineTo(w * 0.5, -h * 0.05);
  ctx.lineTo(w * 0.5, h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#8fd3f4';
  ctx.fillRect(-w * 0.16, -h * 0.58, w * 0.32, h * 0.14);
  ctx.restore();
}

function drawGenericResource(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#5fd873';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const RESOURCE_SPRITES: Record<string, SpriteDrawer> = {
  wheat: drawWheat,
  eggs: drawEgg,
  milk: drawMilk,
};

export function getResourceSprite(resource: string): SpriteDrawer {
  return RESOURCE_SPRITES[resource] ?? drawGenericResource;
}

const RESOURCE_ACCENT_COLORS: Record<string, string> = {
  wheat: '#f2c14e',
  eggs: '#f4f1e6',
  milk: '#8fd3f4',
};

/** Color para numeros flotantes/particulas del efecto de cosecha de cada recurso. */
export function getResourceAccentColor(resource: string): string {
  return RESOURCE_ACCENT_COLORS[resource] ?? '#5fd873';
}
