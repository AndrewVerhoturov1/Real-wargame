/**
 * Soviet WWII small arms, drawn from directly above.
 *
 * Weapon-local space: origin = trigger grip, -y = muzzle direction.
 * The three weapons must be separable by silhouette alone:
 *   Mosin  — very long, thin, wood-heavy.
 *   PPSh   — short and stubby, drum belly around the mid point.
 *   DP-27  — long AND massive, dominated by the flat pan magazine on top.
 */
import { PAL, type WeaponId } from './core';
import { capsule, disc, blob } from './prims';

export interface WeaponDef {
  id: WeaponId;
  label: string;
  /** grip -> muzzle distance (units) */
  fwd: number;
  /** grip -> butt plate distance (units) */
  back: number;
  /** distance from grip to the support hand along the weapon axis */
  gripFore: number;
  /** lateral offset of the support hand (units, + = weapon's right) */
  foreSide: number;
  draw(ctx: CanvasRenderingContext2D, ow: number, detail: boolean): void;
}

const MOSIN: WeaponDef = {
  id: 'mosin',
  label: 'Мосина обр. 1891/30',
  fwd: 0.68,
  back: 0.22,
  gripFore: 0.245,
  foreSide: 0,
  draw(ctx, ow, detail) {
    capsule(ctx, 0, 0.185, 0, 0.095, 0.098, PAL.wood, ow);
    capsule(ctx, 0, 0.12, 0, 0.015, 0.062, PAL.woodDark, ow);
    capsule(ctx, 0, 0.03, 0, -0.13, 0.074, PAL.metal, ow);
    capsule(ctx, 0, -0.1, 0, -0.37, 0.064, PAL.wood, ow);
    capsule(ctx, 0, -0.33, 0, -0.665, 0.036, PAL.metal, ow);
    if (detail) {
      capsule(ctx, -0.035, -0.3, 0.035, -0.3, 0.022, PAL.metalDark, 0);
      capsule(ctx, -0.03, -0.155, 0.03, -0.155, 0.02, PAL.metalDark, 0);
      capsule(ctx, 0.02, -0.04, 0.085, -0.005, 0.032, PAL.metalLight, ow * 0.8);
    }
    disc(ctx, 0, -0.672, 0.028, PAL.metalDark, ow * 0.7);
  },
};

const PPSH: WeaponDef = {
  id: 'ppsh',
  label: 'ППШ-41',
  fwd: 0.4,
  back: 0.19,
  gripFore: 0.215,
  foreSide: 0,
  draw(ctx, ow, detail) {
    capsule(ctx, 0, 0.16, 0, 0.02, 0.096, PAL.wood, ow);
    disc(ctx, 0, -0.085, 0.102, PAL.metal, ow);
    disc(ctx, 0, -0.085, 0.062, PAL.metalLight, 0);
    disc(ctx, 0, -0.085, 0.024, PAL.metalDark, 0);
    capsule(ctx, 0, 0.035, 0, -0.235, 0.072, PAL.metal, ow);
    capsule(ctx, 0, -0.2, 0, -0.375, 0.062, PAL.metalLight, ow);
    if (detail) {
      capsule(ctx, -0.02, -0.245, 0.02, -0.245, 0.014, PAL.metalDark, 0);
      capsule(ctx, -0.02, -0.295, 0.02, -0.295, 0.014, PAL.metalDark, 0);
      capsule(ctx, -0.02, -0.345, 0.02, -0.345, 0.014, PAL.metalDark, 0);
    }
    blob(ctx, [-0.03, -0.355, 0.028, -0.355, 0.05, -0.402, -0.012, -0.402], 0.012, PAL.metalDark, ow);
  },
};

const DP27: WeaponDef = {
  id: 'dp27',
  label: 'ДП-27',
  fwd: 0.72,
  back: 0.24,
  gripFore: 0.315,
  foreSide: 0.01,
  draw(ctx, ow, detail) {
    capsule(ctx, 0, 0.21, 0, 0.07, 0.092, PAL.wood, ow);
    capsule(ctx, 0.01, -0.53, 0.135, -0.665, 0.024, PAL.metalDark, ow * 0.7);
    capsule(ctx, -0.01, -0.53, -0.135, -0.665, 0.024, PAL.metalDark, ow * 0.7);
    capsule(ctx, 0, 0.09, 0, -0.26, 0.084, PAL.metal, ow);
    capsule(ctx, 0, -0.24, 0, -0.645, 0.046, PAL.metal, ow);
    if (detail) {
      capsule(ctx, -0.042, -0.33, 0.042, -0.33, 0.018, PAL.metalDark, 0);
      capsule(ctx, -0.042, -0.375, 0.042, -0.375, 0.018, PAL.metalDark, 0);
      capsule(ctx, -0.042, -0.42, 0.042, -0.42, 0.018, PAL.metalDark, 0);
    }
    blob(ctx, [-0.026, -0.63, 0.026, -0.63, 0.044, -0.715, -0.044, -0.715], 0.014, PAL.metalDark, ow);
    disc(ctx, 0, -0.145, 0.145, PAL.metal, ow);
    disc(ctx, 0, -0.145, 0.108, PAL.metalLight, 0);
    disc(ctx, 0, -0.145, 0.035, PAL.metalDark, 0);
    if (detail) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = PAL.metalDark;
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.arc(0, -0.145, 0.075, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  mosin: MOSIN,
  ppsh: PPSH,
  dp27: DP27,
};

export const WEAPON_LIST: WeaponDef[] = [MOSIN, PPSH, DP27];
