import {
  drawSoldier,
  type DiagOpts,
} from './rig/render';
import type {
  PoseId as RigPoseId,
  SoldierVisualState,
  WeaponId as RigWeaponId,
} from './rig/core';

export const SOLDIER_POSES = ['idle','ready','walk','run','crouch','crouchMove','crouchRun','prone','proneAim','crawl','standAim','crouchAim'] as const;
export type SoldierPoseId = (typeof SOLDIER_POSES)[number];
export const SOLDIER_WEAPONS = ['mosin','ppsh41','dp27'] as const;
export type SoldierWeaponId = (typeof SOLDIER_WEAPONS)[number];

export interface SoldierRenderState {
  pose: SoldierPoseId;
  weapon: SoldierWeaponId;
  phase: number;
  bodyDirection: number;
  attentionDirection: number;
  weaponDirection: number;
  size: number;
  selected?: boolean;
}

export interface SoldierRenderOptions {
  showShadow?: boolean;
  showBodyDirection?: boolean;
  showAttentionDirection?: boolean;
  showWeaponDirection?: boolean;
  showAttentionSector?: boolean;
  attentionSectorRadians?: number;
  /** Draw the transferred rig joints so the skeleton can be inspected directly. */
  showSkeleton?: boolean;
  opacity?: number;
}

export const POSE_LABELS: Record<SoldierPoseId,string> = {
  idle:'Стоит спокойно', ready:'Оружие наготове', walk:'Идёт', run:'Бежит', crouch:'Стоит пригнувшись',
  crouchMove:'Движется пригнувшись', crouchRun:'Бежит пригнувшись', prone:'Лежит', proneAim:'Целится лёжа',
  crawl:'Ползёт', standAim:'Целится стоя', crouchAim:'Целится из приседа',
};

export const WEAPON_LABELS: Record<SoldierWeaponId,string> = {
  mosin:'Винтовка Мосина',
  ppsh41:'ППШ-41',
  dp27:'ДП-27',
};

const POSE_TO_RIG: Record<SoldierPoseId, RigPoseId> = {
  idle:'idle',
  ready:'ready',
  walk:'walk',
  run:'run',
  crouch:'crouch_idle',
  crouchMove:'crouch_walk',
  crouchRun:'crouch_run',
  prone:'prone',
  proneAim:'prone_aim',
  crawl:'crawl',
  standAim:'aim_stand',
  crouchAim:'aim_crouch',
};

const WEAPON_TO_RIG: Record<SoldierWeaponId, RigWeaponId> = {
  mosin:'mosin',
  ppsh41:'ppsh',
  dp27:'dp27',
};

/**
 * Public Real Wargame adapter around the transferred stylized-infantry rig.
 * The body is now built by the source prototype's skeleton + primitive renderer;
 * this function only translates the existing prototype state into that API.
 */
export function drawSoldierTopDown(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: SoldierRenderState,
  options: SoldierRenderOptions = {},
): void {
  const visual: SoldierVisualState = {
    x,
    y,
    size: state.size,
    pose: POSE_TO_RIG[state.pose],
    weapon: WEAPON_TO_RIG[state.weapon],
    bodyAngle: state.bodyDirection,
    lookAngle: state.attentionDirection,
    weaponAngle: state.weaponDirection,
    phase: state.phase,
    selected: Boolean(state.selected),
  };

  const diag: DiagOpts = {
    shadow: options.showShadow !== false,
    bodyDir: Boolean(options.showBodyDirection),
    lookDir: Boolean(options.showAttentionDirection),
    weaponDir: Boolean(options.showWeaponDirection),
    selection: false,
    cone: Boolean(options.showAttentionSector),
    joints: Boolean(options.showSkeleton),
    coneRadians: options.attentionSectorRadians,
  };

  ctx.save();
  ctx.globalAlpha *= options.opacity ?? 1;
  drawSoldier(ctx, visual, diag);
  ctx.restore();
}
