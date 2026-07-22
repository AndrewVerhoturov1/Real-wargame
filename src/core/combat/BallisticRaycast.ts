import type { SimulationState } from '../simulation/SimulationState';
import { isUnitCombatCapable } from './CombatDamage';
import { applyBallisticCombatEffects } from './CombatSuppression';
import {
  createBallisticTraceContext,
  traceBallisticRay,
  type BallisticRayInput,
  type BallisticRayResult,
} from './BallisticTrace';
import {
  intersectRayWithUnitHitShapes,
  normalizeDirection,
} from './UnitHitShapes';

export type {
  BallisticHitType,
  BallisticRayInput,
  BallisticRayResult,
  BallisticTraceContext,
} from './BallisticTrace';
export { createBallisticTraceContext, traceBallisticRay } from './BallisticTrace';

/** Real projectile trace: pure geometry first, combat effects second. */
export function traceProjectile(state: SimulationState, input: BallisticRayInput): BallisticRayResult {
  const direction = normalizeDirection(input.direction);
  const velocity = Math.max(1, input.muzzleVelocityMetresPerSecond);
  const result = traceBallisticRay(createBallisticTraceContext(state.map, state.units), {
    ...input,
    direction,
    muzzleVelocityMetresPerSecond: velocity,
  });

  applyBallisticCombatEffects(state, {
    shotId: input.shotId,
    shooterId: input.shooterId,
    origin: input.origin,
    direction,
    travelledMetres: result.travelledMetres,
    impactPoint: result.impactPoint,
    hitType: result.hitType,
    hitUnitId: result.hitUnitId,
    hitObjectId: result.hitObjectId,
    muzzleVelocityMetresPerSecond: velocity,
  });

  return result;
}

export function hasFriendlyUnitBeforeDistance(
  state: SimulationState,
  input: BallisticRayInput,
  friendlyUnitIds: ReadonlySet<string>,
  intendedDistanceMetres: number,
): string | null {
  const direction = normalizeDirection(input.direction);
  let nearest: { id: string; distance: number } | null = null;
  for (const unit of state.units) {
    if (!friendlyUnitIds.has(unit.id) || unit.id === input.shooterId || !isUnitCombatCapable(unit)) continue;
    const hit = intersectRayWithUnitHitShapes(input.origin, direction, intendedDistanceMetres, unit, state.map);
    if (!hit) continue;
    if (!nearest || hit.distanceMetres < nearest.distance) nearest = { id: unit.id, distance: hit.distanceMetres };
  }
  return nearest?.id ?? null;
}
