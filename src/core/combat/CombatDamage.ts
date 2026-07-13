import type { UnitModel } from '../units/UnitModel';
import type { HitZone } from './UnitHitShapes';

export type CombatCapability = 'effective' | 'wounded' | 'severely_wounded' | 'incapacitated' | 'dead';

export interface UnitHitInput {
  shotId: string;
  zone: HitZone;
  energyJoules: number;
}

export interface UnitHitRecord extends UnitHitInput {
  capability: CombatCapability;
  healthAfter: number;
}

export interface CombatRuntimeState {
  capability: CombatCapability;
  lastHit: UnitHitRecord | null;
}

export interface UnitHitResult extends UnitHitRecord {
  changed: boolean;
}

const runtimeByUnit = new WeakMap<UnitModel, CombatRuntimeState>();

export function getCombatRuntime(unit: UnitModel): CombatRuntimeState {
  let runtime = runtimeByUnit.get(unit);
  if (!runtime) {
    runtime = {
      capability: unit.soldier.condition.health <= 0 ? 'dead' : 'effective',
      lastHit: null,
    };
    runtimeByUnit.set(unit, runtime);
  }
  return runtime;
}

export function isUnitCombatCapable(unit: UnitModel): boolean {
  const capability = getCombatRuntime(unit).capability;
  return capability !== 'incapacitated' && capability !== 'dead';
}

export function applyUnitHit(unit: UnitModel, input: UnitHitInput): UnitHitResult {
  const runtime = getCombatRuntime(unit);
  const previousCapability = runtime.capability;
  const energyFactor = Math.max(0.35, Math.min(1.4, input.energyJoules / 3000));
  const roll = deterministicUnit(`${input.shotId}:${unit.id}:${input.zone}`);
  const capability = resolveCapability(previousCapability, input.zone, roll, energyFactor);
  const healthLoss = resolveHealthLoss(input.zone, energyFactor, roll);
  unit.soldier.condition.health = Math.max(0, Math.round(unit.soldier.condition.health - healthLoss));
  if (capability === 'dead') unit.soldier.condition.health = 0;
  runtime.capability = capability;
  runtime.lastHit = {
    ...input,
    capability,
    healthAfter: unit.soldier.condition.health,
  };

  if (!isUnitCombatCapable(unit)) {
    unit.order = null;
    unit.playerCommand = null;
    unit.behaviorRuntime.currentAction = capability;
    unit.behaviorRuntime.state = 'stressed';
    unit.behaviorRuntime.weaponReady = false;
    unit.behaviorRuntime.reason = capability === 'dead' ? 'Боец погиб.' : 'Боец выведен из строя.';
    unit.behaviorRuntime.lastEvent = capability === 'dead' ? 'combat_unit_dead' : 'combat_unit_incapacitated';
  } else {
    unit.behaviorRuntime.stress = Math.min(100, unit.behaviorRuntime.stress + (input.zone === 'limbs' ? 28 : 45));
    unit.behaviorRuntime.reason = capability === 'severely_wounded' ? 'Боец тяжело ранен.' : 'Боец ранен.';
    unit.behaviorRuntime.lastEvent = 'combat_unit_wounded';
  }

  return {
    ...runtime.lastHit,
    changed: previousCapability !== capability,
  };
}

export function getCombatMovementMultiplier(unit: UnitModel): number {
  switch (getCombatRuntime(unit).capability) {
    case 'wounded': return 0.78;
    case 'severely_wounded': return 0.42;
    case 'incapacitated':
    case 'dead': return 0;
    case 'effective':
    default: return 1;
  }
}

export function getCombatAimMultiplier(unit: UnitModel): number {
  switch (getCombatRuntime(unit).capability) {
    case 'wounded': return 0.82;
    case 'severely_wounded': return 0.52;
    case 'incapacitated':
    case 'dead': return 0;
    case 'effective':
    default: return 1;
  }
}

export function clearCombatRuntime(unit: UnitModel): void {
  runtimeByUnit.delete(unit);
}

function resolveCapability(
  previous: CombatCapability,
  zone: HitZone,
  roll: number,
  energyFactor: number,
): CombatCapability {
  if (previous === 'dead' || previous === 'incapacitated') return previous;
  if (zone === 'head') return roll < 0.62 * energyFactor ? 'dead' : 'incapacitated';
  if (zone === 'torso') {
    if (roll < 0.18 * energyFactor) return 'dead';
    if (roll < 0.78 * energyFactor) return 'incapacitated';
    return 'severely_wounded';
  }
  if (previous === 'severely_wounded') return roll < 0.45 ? 'incapacitated' : previous;
  if (roll < 0.12 * energyFactor) return 'incapacitated';
  if (roll < 0.58 * energyFactor) return 'severely_wounded';
  return 'wounded';
}

function resolveHealthLoss(zone: HitZone, energyFactor: number, roll: number): number {
  const base = zone === 'head' ? 95 : zone === 'torso' ? 72 : 34;
  return base * energyFactor * (0.82 + roll * 0.36);
}

function deterministicUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
