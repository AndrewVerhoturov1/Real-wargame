import type { HitZone } from '../../combat/UnitHitShapes';
import {
  compareHitZones,
  type UnitCombatCapabilitiesV1,
  type WoundSeverity,
  type WoundSlotV1,
} from './InfantryBodyTypes';

interface CapabilityDelta {
  readonly conscious?: boolean;
  readonly alive?: boolean;
  readonly canStand?: boolean;
  readonly canMove?: boolean;
  readonly canUseHands?: boolean;
  readonly canUseWeapon?: boolean;
  readonly movement?: number;
  readonly stability?: number;
  readonly accuracy?: number;
}

export const WOUND_CAPABILITY_TABLE: Readonly<Record<HitZone, Readonly<Record<WoundSeverity, CapabilityDelta>>>> = Object.freeze({
  head: Object.freeze({
    light: { stability: 0.85, accuracy: 0.80 },
    severe: { conscious: false, canStand: false, canMove: false, canUseHands: false, canUseWeapon: false },
    critical: { alive: false, conscious: false, canStand: false, canMove: false, canUseHands: false, canUseWeapon: false },
  }),
  torso: Object.freeze({
    light: { movement: 0.90, stability: 0.85, accuracy: 0.90 },
    severe: { movement: 0.60, stability: 0.55, accuracy: 0.65 },
    critical: { conscious: false, canStand: false, canMove: false, canUseHands: false, canUseWeapon: false },
  }),
  arms: Object.freeze({
    light: { stability: 0.85, accuracy: 0.80 },
    severe: { stability: 0.55, accuracy: 0.45 },
    critical: { canUseHands: false, canUseWeapon: false, stability: 0.25, accuracy: 0.20 },
  }),
  legs: Object.freeze({
    light: { movement: 0.85 },
    severe: { movement: 0.50, stability: 0.80 },
    critical: { canStand: false, movement: 0.25, stability: 0.65 },
  }),
});

export function createFullUnitCombatCapabilities(): UnitCombatCapabilitiesV1 {
  return {
    alive: true,
    conscious: true,
    canStand: true,
    canMove: true,
    canUseHands: true,
    canUseWeapon: true,
    movementSpeedMultiplier: 1,
    stabilityMultiplier: 1,
    accuracyMultiplier: 1,
  };
}

export function deriveUnitCombatCapabilities(slots: readonly WoundSlotV1[]): UnitCombatCapabilitiesV1 {
  const state = { ...createFullUnitCombatCapabilities() };
  const ordered = [...slots].sort((left, right) => compareHitZones(left.zone, right.zone));
  for (const slot of ordered) applyDelta(state, WOUND_CAPABILITY_TABLE[slot.zone][slot.severity]);
  if (!state.alive) {
    state.conscious = false;
    state.canStand = false;
    state.canMove = false;
    state.canUseHands = false;
    state.canUseWeapon = false;
    state.movementSpeedMultiplier = 0;
    state.stabilityMultiplier = 0;
    state.accuracyMultiplier = 0;
  } else if (!state.conscious) {
    state.canStand = false;
    state.canMove = false;
    state.canUseHands = false;
    state.canUseWeapon = false;
    state.movementSpeedMultiplier = 0;
    state.stabilityMultiplier = 0;
    state.accuracyMultiplier = 0;
  } else {
    if (!state.canMove) state.movementSpeedMultiplier = 0;
    if (!state.canUseHands) state.canUseWeapon = false;
  }
  state.movementSpeedMultiplier = clamp01(state.movementSpeedMultiplier);
  state.stabilityMultiplier = clamp01(state.stabilityMultiplier);
  state.accuracyMultiplier = clamp01(state.accuracyMultiplier);
  return state;
}

function applyDelta(state: MutableCapabilities, delta: CapabilityDelta): void {
  state.alive = state.alive && delta.alive !== false;
  state.conscious = state.conscious && delta.conscious !== false;
  state.canStand = state.canStand && delta.canStand !== false;
  state.canMove = state.canMove && delta.canMove !== false;
  state.canUseHands = state.canUseHands && delta.canUseHands !== false;
  state.canUseWeapon = state.canUseWeapon && delta.canUseWeapon !== false;
  state.movementSpeedMultiplier *= delta.movement ?? 1;
  state.stabilityMultiplier *= delta.stability ?? 1;
  state.accuracyMultiplier *= delta.accuracy ?? 1;
}

type MutableCapabilities = { -readonly [K in keyof UnitCombatCapabilitiesV1]: UnitCombatCapabilitiesV1[K] };
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Acceptance-facing aliases with explicit physical meaning. */
export const createFullyCapableUnitCombatCapabilities = createFullUnitCombatCapabilities;
export const calculateUnitCombatCapabilities = deriveUnitCombatCapabilities;
