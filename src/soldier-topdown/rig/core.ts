/**
 * Real Wargame — top-down infantry visual prototype.
 * Core types, math helpers and the "rig" (posed body description).
 *
 * COORDINATE CONTRACT
 * -------------------
 * All rig geometry lives in *body-local units*, where 1.0 unit == the on-screen
 * figure size in pixels (a `size = 32` soldier is drawn with `ctx.scale(32)`).
 *
 *   local +x  -> soldier's right
 *   local -y  -> soldier's forward (the direction the torso faces)
 *
 * A pose therefore always looks "facing up on screen"; the renderer rotates the
 * whole frame by `bodyAngle` (0 = north / screen up, positive = clockwise).
 *
 * The rig is a pure *visual state*: the game model never reads it, and no game
 * logic may depend on the coordinates of an individual primitive.
 */

export type WeaponId = 'mosin' | 'ppsh' | 'dp27';

export type PoseId =
  | 'idle'
  | 'ready'
  | 'walk'
  | 'walk_aim'
  | 'run'
  | 'crouch_idle'
  | 'crouch_walk'
  | 'crouch_run'
  | 'aim_stand'
  | 'aim_crouch'
  | 'prone'
  | 'prone_aim'
  | 'crawl';

export type Stance = 0 | 1 | 2; // 0 stand, 1 crouch, 2 prone

export interface Pt {
  x: number;
  y: number;
}

/** Everything the renderer needs to draw one soldier. Game-model agnostic. */
export interface SoldierVisualState {
  x: number;
  y: number;
  size: number;
  pose: PoseId;
  weapon: WeaponId;
  /** radians, 0 = screen up, positive = clockwise */
  bodyAngle: number;
  /** absolute attention direction (head) */
  lookAngle: number;
  /** absolute weapon direction */
  weaponAngle: number;
  /** animation cycle phase 0..1 */
  phase: number;
  selected: boolean;
}

export const TAU = Math.PI * 2;

export function pt(x = 0, y = 0): Pt {
  return { x, y };
}

export function set(p: Pt, x: number, y: number): Pt {
  p.x = x;
  p.y = y;
  return p;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** shortest signed difference b - a, wrapped into [-PI, PI] */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** rotate a point in place around (cx, cy); s/c are sin/cos of the angle */
export function rotAbout(p: Pt, cx: number, cy: number, s: number, c: number): void {
  const dx = p.x - cx;
  const dy = p.y - cy;
  p.x = cx + dx * c - dy * s;
  p.y = cy + dx * s + dy * c;
}

/**
 * Planar two-bone IK. Places `out` (the elbow / knee) so that the chain
 * root -> out -> target has segment lengths l1 / l2.
 * `bend` = +1 puts the joint on the clockwise side of root->target, -1 on the other.
 */
export function twoBone(
  out: Pt,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  l1: number,
  l2: number,
  bend: number,
): void {
  let dx = bx - ax;
  let dy = by - ay;
  let d = Math.hypot(dx, dy);
  if (d < 1e-5) {
    dx = 0;
    dy = -1;
    d = 1e-5;
  }
  const ux = dx / d;
  const uy = dy / d;
  const dc = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  out.x = ax + ux * a - uy * h * bend;
  out.y = ay + uy * a + ux * h * bend;
}

/**
 * Art-directed mid-joint: sits between `a` and `b` but pushed `fwd` units
 * toward body-forward and `side` units laterally. Used for knees/free arms,
 * where strict IK looks stiff from a top-down camera.
 */
export function midJoint(out: Pt, a: Pt, b: Pt, fwd: number, side: number, bias = 0.5): void {
  out.x = lerp(a.x, b.x, bias) + side;
  out.y = lerp(a.y, b.y, bias) - fwd;
}

/** The posed body. Mutable and pooled — never reallocate this per frame. */
export interface Rig {
  stance: Stance;
  /** whole-figure scale multiplier (crouch/prone read slightly smaller) */
  scale: number;
  /** 0..1 torso height above ground, drives the contact shadow */
  elevation: number;

  hip: Pt;
  chest: Pt;
  neck: Pt;
  head: Pt;
  /** head facing relative to the body, radians */
  headAngle: number;

  shL: Pt;
  shR: Pt;
  elL: Pt;
  elR: Pt;
  hdL: Pt;
  hdR: Pt;

  hipL: Pt;
  hipR: Pt;
  knL: Pt;
  knR: Pt;
  ftL: Pt;
  ftR: Pt;
  ftAngL: number;
  ftAngR: number;
  /** 0..1 foot lift (swing phase) — lifted feet are drawn slightly tighter */
  ftLiftL: number;
  ftLiftR: number;

  /** projected segment lengths, pose dependent (top-down foreshortening) */
  armU: number;
  armF: number;
  armW: number;
  legW: number;
  bootW: number;
  bootL: number;

  headR: number;
  torsoW: number;
  hipW: number;
  shThick: number;

  /** weapon transform in body-local space: grip position + muzzle direction */
  wpn: Pt;
  wpnA: number;
  /** left hand is not on the weapon (free-swinging / reaching) */
  freeL: boolean;

  shadowRX: number;
  shadowRY: number;
  shadowY: number;
}

export function createRig(): Rig {
  return {
    stance: 0,
    scale: 1,
    elevation: 1,
    hip: pt(),
    chest: pt(),
    neck: pt(),
    head: pt(),
    headAngle: 0,
    shL: pt(),
    shR: pt(),
    elL: pt(),
    elR: pt(),
    hdL: pt(),
    hdR: pt(),
    hipL: pt(),
    hipR: pt(),
    knL: pt(),
    knR: pt(),
    ftL: pt(),
    ftR: pt(),
    ftAngL: 0,
    ftAngR: 0,
    ftLiftL: 0,
    ftLiftR: 0,
    armU: 0.16,
    armF: 0.155,
    armW: 0.085,
    legW: 0.1,
    bootW: 0.085,
    bootL: 0.13,
    headR: 0.152,
    torsoW: 0.3,
    hipW: 0.115,
    shThick: 0.155,
    wpn: pt(),
    wpnA: 0,
    freeL: false,
    shadowRX: 0.22,
    shadowRY: 0.2,
    shadowY: 0.04,
  };
}

/** Muted Soviet-infantry palette. Flat, no gloss, darker contour. */
export const PAL = {
  outline: '#1d2018',
  uniform: '#7b7850',
  uniformDark: '#615f3e',
  uniformLight: '#8f8c60',
  webbing: '#4c4130',
  helmet: '#59613f',
  helmetTop: '#6d7550',
  helmetRim: '#414932',
  boot: '#37302a',
  bootLight: '#463d34',
  skin: '#c39a70',
  skinDark: '#a37a52',
  wood: '#7b5330',
  woodDark: '#5c3d23',
  metal: '#3a3d36',
  metalLight: '#4f544a',
  metalDark: '#2b2e29',
  shadow: 'rgba(10,14,8,0.30)',
} as const;

export const DIAG = {
  body: '#7ad48b',
  look: '#5fd0e6',
  weapon: '#e8b054',
  select: '#e2c069',
  cone: 'rgba(95,208,230,0.13)',
  joint: '#ff5d7a',
} as const;
