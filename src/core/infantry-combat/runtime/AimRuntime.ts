import type { BallisticDirection3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import type {
  AimFactorBreakdownV1,
  AimTrackingRuntimeV1,
  InfantryWeaponInstanceV1,
} from './InfantryCombatRuntimeTypes';
import {
  calculateAimFactorBreakdown,
  normalizeAimTrackingRuntime as normalizeAimTrackingRuntimeStage5,
  serializeAimTrackingRuntime as serializeAimTrackingRuntimeStage5,
} from './AimRuntimeStage5';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import { applyMachineGunFireFactors } from './MachineGunFireModifiers';

export * from './AimRuntimeStage5';

const UNIT_DIRECTION_MAGNITUDE_TOLERANCE = 1e-12;
const DIRECTION_MAGNITUDE_EPSILON = 1e-9;

/**
 * Stage 5 normalizes every stored direction on load. A direction that is
 * already unit length can differ from exactly 1 by one IEEE-754 ULP, and
 * normalizing it again changes its components. Preserve such valid stored
 * vectors bit-for-bit so save/load continuation remains exactly deterministic;
 * malformed directions still use the Stage 5 repair path.
 */
export function normalizeAimTrackingRuntime(
  value: unknown,
  requestedSeconds: number,
  fallbackDirection: BallisticDirection3,
): AimTrackingRuntimeV1 {
  const normalized = normalizeAimTrackingRuntimeStage5(value, requestedSeconds, fallbackDirection);
  preserveStoredUnitDirections(normalized, value);
  return normalized;
}

export function serializeAimTrackingRuntime(value: AimTrackingRuntimeV1): AimTrackingRuntimeV1 {
  const serialized = serializeAimTrackingRuntimeStage5(value);
  preserveStoredUnitDirections(serialized, value);
  return serialized;
}

export function resolveProductionAimFactors(
  state: Pick<SimulationState, 'map'>,
  shooter: UnitModel,
  weapon: InfantryWeaponInstanceV1,
): AimFactorBreakdownV1 {
  const capabilities = getEffectiveCombatCapabilities(shooter);
  const base = calculateAimFactorBreakdown({
    weapon: weapon.resolved.weapon,
    posture: shooter.behaviorRuntime.posture,
    isMoving: shooter.movementRuntime.isMoving,
    movementSpeedMetresPerSecond: Math.hypot(
      shooter.movementRuntime.velocityCellsPerSecond.x,
      shooter.movementRuntime.velocityCellsPerSecond.y,
    ) * state.map.metersPerCell,
    shootingSkill: weapon.operatorProfile.shootingSkill,
    proficiency: weapon.operatorProfile.proficiencyByWeaponClass[weapon.resolved.weapon.weaponClass],
    fatigue: shooter.infantryCombatRuntime.physiology.fatigue.fatigue,
    woundStabilityMultiplier: clamp(
      Math.min(capabilities.stabilityMultiplier, capabilities.accuracyMultiplier),
      0.2,
      1,
    ),
  });
  const mode = shooter.infantryCombatRuntime.activeFireTask?.mode ?? 'single';
  return applyMachineGunFireFactors(base, weapon, mode);
}

function preserveStoredUnitDirections(target: AimTrackingRuntimeV1, source: unknown): void {
  if (!isRecord(source) || !isRecord(source.solution)) return;
  preserveDirection(target.solution, source.solution, 'desiredDirection');
  preserveDirection(target.solution, source.solution, 'currentDirection');
  preserveDirection(target.solution, source.solution, 'directionSegmentStart');
}

function preserveDirection(
  target: AimTrackingRuntimeV1['solution'],
  source: Record<string, unknown>,
  key: 'desiredDirection' | 'currentDirection' | 'directionSegmentStart',
): void {
  const direction = nearUnitDirection(source[key]);
  if (direction) target[key] = direction;
}

function nearUnitDirection(value: unknown): BallisticDirection3 | null {
  if (!isRecord(value)) return null;
  const x = finiteOrNull(value.x);
  const y = finiteOrNull(value.y);
  const z = finiteOrNull(value.z);
  if (x === null || y === null || z === null) return null;
  const magnitude = Math.hypot(x, y, z);
  if (
    magnitude <= DIRECTION_MAGNITUDE_EPSILON
    || Math.abs(magnitude - 1) > UNIT_DIRECTION_MAGNITUDE_TOLERANCE
  ) return null;
  return { x, y, z };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
