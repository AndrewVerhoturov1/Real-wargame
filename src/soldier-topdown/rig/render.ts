/**
 * Renderer. It only paints the visual state it is given: no game truth here.
 * A single pooled rig is reused for every draw call, so a full battlefield of
 * soldiers allocates nothing per frame.
 */
import {
  PAL,
  DIAG,
  clamp,
  createRig,
  lerp,
  type Pt,
  type Rig,
  type SoldierVisualState,
} from './core';
import { buildRig } from './poses';
import { WEAPONS } from './weapons';
import { blob, capsule, disc, oval, shade } from './prims';

export interface DiagOpts {
  shadow: boolean;
  bodyDir: boolean;
  lookDir: boolean;
  weaponDir: boolean;
  selection: boolean;
  cone: boolean;
  joints: boolean;
  coneRadians?: number;
}

export const DEFAULT_DIAG: DiagOpts = {
  shadow: true,
  bodyDir: false,
  lookDir: false,
  weaponDir: false,
  selection: false,
  cone: false,
  joints: false,
};

const scratch = createRig();

/** screen-space light direction (constant for the whole scene) */
const LIGHT_X = 0.5;
const LIGHT_Y = 0.72;

function drawBoot(
  ctx: CanvasRenderingContext2D,
  f: Pt,
  ang: number,
  lift: number,
  r: Rig,
  ow: number,
): void {
  const s = Math.sin(ang);
  const c = Math.cos(ang);
  const k = 1 + lift * 0.09;
  const cx = f.x - s * -0.018 * k;
  const cy = f.y + c * -0.018 * k;
  oval(ctx, cx, cy, (r.bootW * 0.5) * k, (r.bootL * 0.5) * k, ang, PAL.boot, ow);
  shade(ctx, cx - s * -0.03 * k, cy + c * -0.03 * k, r.bootW * 0.3 * k, r.bootL * 0.22 * k, ang, PAL.bootLight, 0.5);
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  r: Rig,
  hip: Pt,
  knee: Pt,
  foot: Pt,
  ang: number,
  lift: number,
  ow: number,
): void {
  capsule(ctx, hip.x, hip.y, knee.x, knee.y, r.legW, PAL.uniformDark, ow);
  capsule(ctx, knee.x, knee.y, foot.x, foot.y, r.legW * 0.84, PAL.uniformDark, ow);
  drawBoot(ctx, foot, ang, lift, r, ow);
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  r: Rig,
  sh: Pt,
  el: Pt,
  hd: Pt,
  ow: number,
): void {
  capsule(ctx, sh.x, sh.y, el.x, el.y, r.armW, PAL.uniform, ow);
  capsule(ctx, el.x, el.y, hd.x, hd.y, r.armW * 0.86, PAL.uniform, ow);
}

const quad: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

function drawFigure(
  ctx: CanvasRenderingContext2D,
  r: Rig,
  sizePx: number,
  weapon: SoldierVisualState['weapon'],
  diag: DiagOpts,
  bodyAngle: number,
): void {
  const ow = clamp(sizePx * 0.021, 0.6, 1.15) / sizePx;
  const detail = sizePx >= 38;

  if (diag.shadow) {
    const ca = Math.cos(-bodyAngle);
    const sa = Math.sin(-bodyAngle);
    const off = 0.045 + r.elevation * 0.075;
    const lx = (LIGHT_X * ca - LIGHT_Y * sa) * off;
    const ly = (LIGHT_X * sa + LIGHT_Y * ca) * off;
    const cx = lerp(r.hip.x, r.chest.x, 0.45) + lx;
    const cy = lerp(r.hip.y, r.chest.y, 0.45) + ly;
    ctx.save();
    ctx.globalAlpha = 0.9 - r.elevation * 0.25;
    oval(ctx, cx, cy, r.shadowRX * 1.05, r.shadowRY * 1.05, 0, PAL.shadow, 0);
    oval(ctx, r.head.x + lx, r.head.y + ly, r.headR * 1.15, r.headR * 1.15, 0, PAL.shadow, 0);
    ctx.restore();
  }

  drawLeg(ctx, r, r.hipL, r.knL, r.ftL, r.ftAngL, r.ftLiftL, ow);
  drawLeg(ctx, r, r.hipR, r.knR, r.ftR, r.ftAngR, r.ftLiftR, ow);

  capsule(ctx, r.hipL.x, r.hipL.y, r.hipR.x, r.hipR.y, r.hipW * 1.3, PAL.uniformDark, ow);

  quad[0] = lerp(r.shL.x, r.chest.x, 0.24);
  quad[1] = lerp(r.shL.y, r.chest.y, 0.24);
  quad[2] = lerp(r.shR.x, r.chest.x, 0.24);
  quad[3] = lerp(r.shR.y, r.chest.y, 0.24);
  quad[4] = lerp(r.hipR.x, r.hip.x, 0.12);
  quad[5] = lerp(r.hipR.y, r.hip.y, 0.12);
  quad[6] = lerp(r.hipL.x, r.hip.x, 0.12);
  quad[7] = lerp(r.hipL.y, r.hip.y, 0.12);
  blob(ctx, quad, 0.072, PAL.uniform, ow);

  if (detail) {
    capsule(
      ctx,
      lerp(r.hipL.x, r.hip.x, 0.22),
      lerp(r.hipL.y, r.hip.y, 0.22),
      lerp(r.hipR.x, r.hip.x, 0.22),
      lerp(r.hipR.y, r.hip.y, 0.22),
      0.042,
      PAL.webbing,
      0,
    );
  }
  shade(ctx, lerp(r.chest.x, r.hip.x, 0.75), lerp(r.chest.y, r.hip.y, 0.75), 0.13, 0.1, 0, '#3d3b26', 0.25);

  drawArm(ctx, r, r.shL, r.elL, r.hdL, ow);
  drawArm(ctx, r, r.shR, r.elR, r.hdR, ow);

  ctx.save();
  ctx.translate(r.wpn.x, r.wpn.y);
  ctx.rotate(r.wpnA);
  WEAPONS[weapon].draw(ctx, ow, detail);
  ctx.restore();

  disc(ctx, r.hdR.x, r.hdR.y, 0.05, PAL.skin, ow * 0.8);
  disc(ctx, r.hdL.x, r.hdL.y, r.freeL ? 0.048 : 0.05, r.freeL ? PAL.skinDark : PAL.skin, ow * 0.8);

  capsule(
    ctx,
    lerp(r.shL.x, r.chest.x, 0.1),
    lerp(r.shL.y, r.chest.y, 0.1),
    lerp(r.shR.x, r.chest.x, 0.1),
    lerp(r.shR.y, r.chest.y, 0.1),
    r.shThick,
    PAL.uniformLight,
    ow,
  );
  shade(
    ctx,
    lerp(r.shL.x, r.shR.x, 0.5),
    lerp(r.shL.y, r.shR.y, 0.5) + 0.012,
    r.shThick * 0.9,
    r.shThick * 0.36,
    Math.atan2(r.shR.y - r.shL.y, r.shR.x - r.shL.x),
    '#3d3b26',
    0.18,
  );

  const hs = Math.sin(r.headAngle);
  const hc = Math.cos(r.headAngle);
  capsule(ctx, r.neck.x, r.neck.y, lerp(r.neck.x, r.head.x, 0.7), lerp(r.neck.y, r.head.y, 0.7), 0.1, PAL.uniformDark, ow);
  oval(ctx, r.head.x, r.head.y, r.headR, r.headR * 1.03, r.headAngle, PAL.helmetRim, ow);
  oval(
    ctx,
    r.head.x + hs * r.headR * 0.66,
    r.head.y - hc * r.headR * 0.66,
    r.headR * (detail ? 0.32 : 0.36),
    r.headR * 0.27,
    r.headAngle,
    PAL.skin,
    0,
  );
  oval(
    ctx,
    r.head.x - hs * r.headR * 0.22,
    r.head.y + hc * r.headR * 0.22,
    r.headR * 0.75,
    r.headR * 0.77,
    r.headAngle,
    PAL.helmet,
    ow * 0.7,
  );
  shade(
    ctx,
    r.head.x - hs * r.headR * 0.3,
    r.head.y + hc * r.headR * 0.3,
    r.headR * 0.46,
    r.headR * 0.42,
    r.headAngle,
    PAL.helmetTop,
    0.8,
  );

  if (diag.joints) {
    const jr = 0.022;
    ctx.fillStyle = DIAG.joint;
    const js: Pt[] = [r.hip, r.chest, r.neck, r.shL, r.shR, r.elL, r.elR, r.hdL, r.hdR, r.hipL, r.hipR, r.knL, r.knR, r.ftL, r.ftR];
    for (let i = 0; i < js.length; i++) {
      ctx.beginPath();
      ctx.arc(js[i].x, js[i].y, jr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function ray(
  ctx: CanvasRenderingContext2D,
  ang: number,
  from: number,
  to: number,
  color: string,
  w: number,
): void {
  const sx = Math.sin(ang);
  const cy = -Math.cos(ang);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx * from, cy * from);
  ctx.lineTo(sx * to, cy * to);
  ctx.stroke();
  const hw = w * 1.9;
  ctx.beginPath();
  ctx.moveTo(sx * (to + w * 2.4), cy * (to + w * 2.4));
  ctx.lineTo(sx * to - cy * hw, cy * to + sx * hw);
  ctx.lineTo(sx * to + cy * hw, cy * to - sx * hw);
  ctx.closePath();
  ctx.fill();
}

export function drawSoldier(ctx: CanvasRenderingContext2D, st: SoldierVisualState, diag: DiagOpts): void {
  const r = buildRig(scratch, st);
  const px = st.size * r.scale;
  ctx.save();
  ctx.translate(st.x, st.y);

  if (diag.cone) {
    const half = (diag.coneRadians ?? 1.1) * 0.5;
    const rad = st.size * 2.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, rad, st.lookAngle - Math.PI / 2 - half, st.lookAngle - Math.PI / 2 + half);
    ctx.closePath();
    ctx.fillStyle = DIAG.cone;
    ctx.fill();
  }

  if (diag.selection || st.selected) {
    const rad = st.size * (r.stance === 2 ? 0.72 : 0.56);
    ctx.strokeStyle = DIAG.select;
    ctx.lineWidth = Math.max(1, st.size * 0.032);
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a0 = (Math.PI / 2) * i + 0.34;
      ctx.beginPath();
      ctx.arc(0, 0, rad, a0, a0 + 0.62);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.rotate(st.bodyAngle);
  ctx.scale(px, px);
  drawFigure(ctx, r, px, st.weapon, diag, st.bodyAngle);
  ctx.restore();

  const lw = Math.max(1.1, st.size * 0.035);
  if (diag.bodyDir) ray(ctx, st.bodyAngle, st.size * 0.2, st.size * 0.78, DIAG.body, lw);
  if (diag.weaponDir) ray(ctx, st.weaponAngle, st.size * 0.4, st.size * 1.05, DIAG.weapon, lw * 0.85);
  if (diag.lookDir) ray(ctx, st.lookAngle, st.size * 0.3, st.size * 1.3, DIAG.look, lw * 0.75);

  ctx.restore();
}

/** rough on-screen radius, used for hit-testing and gallery framing */
export function soldierRadius(st: SoldierVisualState): number {
  const meta = st.pose;
  const long = meta === 'prone' || meta === 'prone_aim' || meta === 'crawl';
  return st.size * (long ? 0.75 : 0.5);
}
