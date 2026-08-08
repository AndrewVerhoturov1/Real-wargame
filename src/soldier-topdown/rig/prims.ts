/**
 * Flat 2D primitives used to assemble every soldier and weapon.
 * Everything is drawn in *unit space* (the caller applies ctx.scale(size)),
 * so line widths are expressed in units too.
 *
 * Each primitive paints its own dark contour by over-stroking, which keeps the
 * figure readable down to ~24 px without any cartoon outline pass.
 */

export function capsule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  fill: string,
  ow: number,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  if (ow > 0) {
    ctx.lineWidth = w + ow * 2;
    ctx.strokeStyle = '#1d2018';
    ctx.stroke();
  }
  ctx.lineWidth = w;
  ctx.strokeStyle = fill;
  ctx.stroke();
}

/** three-point capsule chain (limb with a joint) drawn as one continuous shape */
export function limb(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  w1: number,
  w2: number,
  fill: string,
  ow: number,
): void {
  capsule(ctx, ax, ay, bx, by, w1, fill, ow);
  capsule(ctx, bx, by, cx, cy, w2, fill, ow);
}

/** rounded polygon: stroke-inflated path (corner radius = r) */
export function blob(
  ctx: CanvasRenderingContext2D,
  p: readonly number[],
  r: number,
  fill: string,
  ow: number,
): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
  if (ow > 0) {
    ctx.lineWidth = r * 2 + ow * 2;
    ctx.strokeStyle = '#1d2018';
    ctx.stroke();
  }
  ctx.lineWidth = r * 2;
  ctx.strokeStyle = fill;
  ctx.fillStyle = fill;
  ctx.stroke();
  ctx.fill();
}

export function disc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  ow: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (ow > 0) {
    ctx.lineWidth = ow;
    ctx.strokeStyle = '#1d2018';
    ctx.stroke();
  }
}

export function oval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  fill: string,
  ow: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (ow > 0) {
    ctx.lineWidth = ow;
    ctx.strokeStyle = '#1d2018';
    ctx.stroke();
  }
}

/** soft inner shade used to separate the upper plane from the lower one */
export function shade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
