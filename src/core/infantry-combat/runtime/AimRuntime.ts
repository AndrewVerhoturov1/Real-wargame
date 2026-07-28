import { normalizeDirection, type BallisticDirection3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import type {
  AimFactorBreakdownV1,
  AimSolutionRuntimeV1,
  AimTrackingRuntimeV1,
  FireTaskRuntimeV1,
  InfantryWeaponInstanceV1,
} from './InfantryCombatRuntimeTypes';
import {
  AIM_DIRECTION_PROGRESS_PER_SECOND,
  advanceAimPhysicalProgress as advanceAimPhysicalProgressStage5,
  calculateAimFactorBreakdown,
  normalizeAimTrackingRuntime as normalizeAimTrackingRuntimeStage5,
  serializeAimTrackingRuntime as serializeAimTrackingRuntimeStage5,
  updateAimTrackingAtBoundary as updateAimTrackingAtBoundaryStage5,
} from './AimRuntimeStage5';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import { applyMachineGunFireFactors } from './MachineGunFireModifiers';

export * from './AimRuntimeStage5';

const UNIT_DIRECTION_MAGNITUDE_TOLERANCE = 1e-12;
const DIRECTION_MAGNITUDE_EPSILON = 1e-9;
const AIM_ALIGNMENT_TOLERANCE_RADIANS = Math.PI / 180;
const NEAR_PARALLEL_DOT = 0.9995;
const CANONICAL_SCALE = 1_000_000_000_000;

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

/**
 * Refreshes the perception solution and then applies the physical direction
 * gate. Aim quality alone must never authorize a shot while the weapon is
 * still traversing toward the target.
 */
export function updateAimTrackingAtBoundary(
  state: Pick<SimulationState, 'map'>,
  shooter: UnitModel,
  task: FireTaskRuntimeV1,
  weapon: InfantryWeaponInstanceV1,
  boundarySeconds: number,
): AimSolutionRuntimeV1 {
  const solution = updateAimTrackingAtBoundaryStage5(state, shooter, task, weapon, boundarySeconds);
  applyDirectionGate(task);
  return solution;
}

/**
 * Keeps the established deterministic quality clock, but rotates the weapon
 * with a bounded angular speed. The old normalized linear blend moved by a
 * fraction of the remaining angle, so small corrections converged too slowly
 * and opposite vectors could collapse through a zero vector.
 */
export function advanceAimPhysicalProgress(
  task: FireTaskRuntimeV1,
  factors: AimFactorBreakdownV1,
  deltaSeconds: number,
): void {
  const solution = task.aimTracking.solution;
  const currentDirection = structuredClone(solution.currentDirection);
  const desiredDirection = structuredClone(solution.desiredDirection);
  advanceAimPhysicalProgressStage5(task, factors, deltaSeconds);

  const from = normalizeDirection(currentDirection);
  const to = normalizeDirection(desiredDirection);
  const angularDistance = angleBetween(from, to);
  const angularSpeed = AIM_DIRECTION_PROGRESS_PER_SECOND * Math.max(0.1, factors.aimRateMultiplier);
  const maximumStep = angularSpeed * Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  const progress = angularDistance <= DIRECTION_MAGNITUDE_EPSILON
    ? 1
    : Math.min(1, maximumStep / angularDistance);
  solution.currentDirection = interpolateAimDirection(from, to, progress);
  applyDirectionGate(task);
}

export function isAimDirectionAligned(solution: AimSolutionRuntimeV1): boolean {
  if (!solution.valid) return false;
  return angleBetween(solution.currentDirection, solution.desiredDirection) <= AIM_ALIGNMENT_TOLERANCE_RADIANS;
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

function applyDirectionGate(task: FireTaskRuntimeV1): void {
  const solution = task.aimTracking.solution;
  if (!isAimDirectionAligned(solution)) {
    solution.usableAimQuality = 0;
    task.aimQuality = 0;
    return;
  }
  const usable = canonicalUnitInterval(solution.physicalAimQuality * solution.solutionQuality);
  solution.usableAimQuality = usable;
  task.aimQuality = usable;
}

function interpolateAimDirection(
  fromValue: BallisticDirection3,
  toValue: BallisticDirection3,
  rawProgress: number,
): BallisticDirection3 {
  const progress = clamp(rawProgress, 0, 1);
  const from = normalizeDirection(fromValue);
  const to = normalizeDirection(toValue);
  if (progress <= 0) return from;
  if (progress >= 1) return to;

  const dot = clamp(from.x * to.x + from.y * to.y + from.z * to.z, -1, 1);
  if (dot >= NEAR_PARALLEL_DOT) {
    return normalizeDirection({
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      z: from.z + (to.z - from.z) * progress,
    });
  }

  if (dot <= -NEAR_PARALLEL_DOT) {
    const reference = Math.abs(from.z) < 0.9
      ? { x: 0, y: 0, z: 1 }
      : { x: 0, y: 1, z: 0 };
    const orthogonal = normalizeDirection(cross(from, reference));
    const angle = Math.PI * progress;
    return normalizeDirection({
      x: from.x * Math.cos(angle) + orthogonal.x * Math.sin(angle),
      y: from.y * Math.cos(angle) + orthogonal.y * Math.sin(angle),
      z: from.z * Math.cos(angle) + orthogonal.z * Math.sin(angle),
    });
  }

  const angle = Math.acos(dot);
  const denominator = Math.sin(angle);
  const fromWeight = Math.sin((1 - progress) * angle) / denominator;
  const toWeight = Math.sin(progress * angle) / denominator;
  return normalizeDirection({
    x: from.x * fromWeight + to.x * toWeight,
    y: from.y * fromWeight + to.y * toWeight,
    z: from.z * fromWeight + to.z * toWeight,
  });
}

function angleBetween(leftValue: BallisticDirection3, rightValue: BallisticDirection3): number {
  const left = normalizeDirection(leftValue);
  const right = normalizeDirection(rightValue);
  return Math.acos(clamp(left.x * right.x + left.y * right.y + left.z * right.z, -1, 1));
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

function cross(left: BallisticDirection3, right: BallisticDirection3): BallisticDirection3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function canonicalUnitInterval(value: number): number {
  return Math.round(clamp(value, 0, 1) * CANONICAL_SCALE) / CANONICAL_SCALE;
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
