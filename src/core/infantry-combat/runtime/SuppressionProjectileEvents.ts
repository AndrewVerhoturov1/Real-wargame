import {
  queryUnitsNearBallisticSegmentInto,
  type CombatUnitIndex,
} from '../../combat/CombatUnitSpatialIndex';
import type { BallisticDirection3, BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import { getSuppressionEventBufferScratch, queueSuppressionEvent } from './SuppressionEventBuffer';
import {
  distanceFromPointToUnit,
  distanceFromProjectileSegmentToUnit,
  incomingSuppressionDirection,
} from './SuppressionGeometry';
import {
  MAX_SUPPRESSION_CANDIDATES_PER_SEGMENT,
  SUPPRESSION_DIRECT_HIT_BASE_IMPULSE,
  SUPPRESSION_EVENT_SCHEMA_VERSION,
  SUPPRESSION_NEAR_IMPACT_BASE_IMPULSE,
  SUPPRESSION_NEAR_IMPACT_RADIUS_METRES,
  SUPPRESSION_NEAR_MISS_BASE_IMPULSE,
  SUPPRESSION_NEAR_MISS_RADIUS_METRES,
  type SuppressionEventV1,
} from './SuppressionTypes';
import type { ProjectileImpactV1, ProjectileRuntimeStateV3 } from './ProjectileRuntimeTypes';

const EPSILON = 1e-9;
const BROAD_PHASE_BODY_PADDING_METRES = 0.75;

export function queueNearMissSuppressionForSegment(input: {
  readonly state: SimulationState;
  readonly runtime: ProjectileRuntimeStateV3;
  readonly unitIndex: CombatUnitIndex;
  readonly candidates: UnitModel[];
  readonly projectileId: string;
  readonly shotId: string;
  readonly shooterId: string;
  readonly start: BallisticPoint3;
  readonly end: BallisticPoint3;
  readonly segmentStartSeconds: number;
  readonly segmentDurationSeconds: number;
  readonly velocity: BallisticDirection3;
  readonly continuousFireScore: number;
  readonly directHitUnitId: string | null;
  readonly maximumEvents: number;
}): number {
  if (input.maximumEvents <= 0) return 0;
  rankCandidatesBySegmentDistance(input.candidates, input.start, input.end, input.state);
  const candidateCount = Math.min(input.candidates.length, MAX_SUPPRESSION_CANDIDATES_PER_SEGMENT);
  if (input.candidates.length > candidateCount) input.runtime.diagnostics.suppressionCandidateTruncationCount += 1;
  const incomingDirection = incomingSuppressionDirection(input.velocity);
  let emitted = 0;
  for (let index = 0; index < candidateCount && emitted < input.maximumEvents; index += 1) {
    const affected = input.candidates[index]!;
    if (affected.id === input.shooterId || affected.id === input.directHitUnitId) continue;
    const eventId = `${input.projectileId}:near-miss:${affected.id}`;
    if (affected.infantryCombatRuntime.suppression.appliedEventIds.includes(eventId)) continue;
    const distance = distanceFromProjectileSegmentToUnit(input.start, input.end, affected, input.state.map);
    if (distance.distanceMetres > SUPPRESSION_NEAR_MISS_RADIUS_METRES + EPSILON) continue;
    const eventSeconds = canonicalSeconds(
      input.segmentStartSeconds + input.segmentDurationSeconds * distance.segmentFraction,
    );
    const event: SuppressionEventV1 = Object.freeze({
      schemaVersion: SUPPRESSION_EVENT_SCHEMA_VERSION,
      eventId,
      sourceUnitId: input.shooterId,
      affectedUnitId: affected.id,
      shotId: input.shotId,
      projectileId: input.projectileId,
      kind: 'near_miss',
      eventSeconds,
      distanceMetres: distance.distanceMetres,
      incomingDirection,
      continuousFireScore: clamp01(input.continuousFireScore),
      baseImpulse: SUPPRESSION_NEAR_MISS_BASE_IMPULSE,
    });
    if (queueSuppressionEvent(input.runtime, event, affected)) emitted += 1;
  }
  return emitted;
}

export function queueImpactSuppression(input: {
  readonly state: SimulationState;
  readonly runtime: ProjectileRuntimeStateV3;
  readonly unitIndex: CombatUnitIndex;
  readonly impact: ProjectileImpactV1;
  readonly continuousFireScore: number;
  readonly maximumEvents: number;
}): number {
  if (input.maximumEvents <= 0) return 0;
  const incomingDirection = incomingSuppressionDirection(input.impact.velocityBeforeImpact);
  let emitted = 0;
  const direct = input.impact.hitUnitId ? input.unitIndex.unitsById.get(input.impact.hitUnitId) ?? null : null;
  if (direct && direct.id !== input.impact.shooterId && emitted < input.maximumEvents) {
    const directEvent: SuppressionEventV1 = Object.freeze({
      schemaVersion: SUPPRESSION_EVENT_SCHEMA_VERSION,
      eventId: `${input.impact.impactId}:suppression:${direct.id}`,
      sourceUnitId: input.impact.shooterId,
      affectedUnitId: direct.id,
      shotId: input.impact.shotId,
      projectileId: input.impact.projectileId,
      kind: 'direct_hit',
      eventSeconds: input.impact.impactSeconds,
      distanceMetres: 0,
      incomingDirection,
      continuousFireScore: clamp01(input.continuousFireScore),
      baseImpulse: SUPPRESSION_DIRECT_HIT_BASE_IMPULSE,
    });
    if (queueSuppressionEvent(input.runtime, directEvent, direct)) emitted += 1;
  }

  if (emitted >= input.maximumEvents) return emitted;
  const scratch = getSuppressionEventBufferScratch(input.runtime);
  const pointGridX = input.impact.point.xMetres / input.state.map.metersPerCell;
  const pointGridY = input.impact.point.yMetres / input.state.map.metersPerCell;
  scratch.pointGrid.x = pointGridX;
  scratch.pointGrid.y = pointGridY;
  queryUnitsNearBallisticSegmentInto(
    input.state,
    scratch.pointGrid,
    scratch.pointGrid,
    SUPPRESSION_NEAR_IMPACT_RADIUS_METRES + BROAD_PHASE_BODY_PADDING_METRES,
    scratch.unitCandidates,
    scratch.unitQueryScratch,
    input.unitIndex,
  );
  rankCandidatesByPointDistance(scratch.unitCandidates, input.impact.point, input.state);
  const candidateCount = Math.min(scratch.unitCandidates.length, MAX_SUPPRESSION_CANDIDATES_PER_SEGMENT);
  if (scratch.unitCandidates.length > candidateCount) input.runtime.diagnostics.suppressionCandidateTruncationCount += 1;
  for (let index = 0; index < candidateCount && emitted < input.maximumEvents; index += 1) {
    const affected = scratch.unitCandidates[index]!;
    if (affected.id === input.impact.shooterId || affected.id === direct?.id) continue;
    const distance = distanceFromPointToUnit(input.impact.point, affected, input.state.map);
    if (distance > SUPPRESSION_NEAR_IMPACT_RADIUS_METRES + EPSILON) continue;
    const event: SuppressionEventV1 = Object.freeze({
      schemaVersion: SUPPRESSION_EVENT_SCHEMA_VERSION,
      eventId: `${input.impact.impactId}:suppression:${affected.id}`,
      sourceUnitId: input.impact.shooterId,
      affectedUnitId: affected.id,
      shotId: input.impact.shotId,
      projectileId: input.impact.projectileId,
      kind: 'near_impact',
      eventSeconds: input.impact.impactSeconds,
      distanceMetres: distance,
      incomingDirection,
      continuousFireScore: clamp01(input.continuousFireScore),
      baseImpulse: SUPPRESSION_NEAR_IMPACT_BASE_IMPULSE,
    });
    if (queueSuppressionEvent(input.runtime, event, affected)) emitted += 1;
  }
  return emitted;
}

function rankCandidatesBySegmentDistance(
  candidates: UnitModel[],
  start: BallisticPoint3,
  end: BallisticPoint3,
  state: SimulationState,
): void {
  const limit = Math.min(candidates.length, MAX_SUPPRESSION_CANDIDATES_PER_SEGMENT);
  for (let target = 0; target < limit; target += 1) {
    let best = target;
    let bestDistance = distanceFromProjectileSegmentToUnit(start, end, candidates[best]!, state.map).distanceMetres;
    for (let index = target + 1; index < candidates.length; index += 1) {
      const distance = distanceFromProjectileSegmentToUnit(start, end, candidates[index]!, state.map).distanceMetres;
      if (distance < bestDistance - EPSILON || (Math.abs(distance - bestDistance) <= EPSILON && compareText(candidates[index]!.id, candidates[best]!.id) < 0)) {
        best = index;
        bestDistance = distance;
      }
    }
    if (best !== target) {
      const value = candidates[target]!;
      candidates[target] = candidates[best]!;
      candidates[best] = value;
    }
  }
}

function rankCandidatesByPointDistance(
  candidates: UnitModel[],
  point: BallisticPoint3,
  state: SimulationState,
): void {
  const limit = Math.min(candidates.length, MAX_SUPPRESSION_CANDIDATES_PER_SEGMENT);
  for (let target = 0; target < limit; target += 1) {
    let best = target;
    let bestDistance = distanceFromPointToUnit(point, candidates[best]!, state.map);
    for (let index = target + 1; index < candidates.length; index += 1) {
      const distance = distanceFromPointToUnit(point, candidates[index]!, state.map);
      if (distance < bestDistance - EPSILON || (Math.abs(distance - bestDistance) <= EPSILON && compareText(candidates[index]!.id, candidates[best]!.id) < 0)) {
        best = index;
        bestDistance = distance;
      }
    }
    if (best !== target) {
      const value = candidates[target]!;
      candidates[target] = candidates[best]!;
      candidates[best] = value;
    }
  }
}
function canonicalSeconds(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
