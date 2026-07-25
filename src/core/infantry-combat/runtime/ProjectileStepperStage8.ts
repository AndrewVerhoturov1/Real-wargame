import {
  traceBallisticRayPrepared,
  type BallisticRayResult,
} from '../../combat/BallisticTrace';
import {
  getCombatUnitSpatialIndex,
  queryUnitsNearBallisticSegmentInto,
  type CombatUnitIndex,
} from '../../combat/CombatUnitSpatialIndex';
import type { SimulationState } from '../../simulation/SimulationState';
import {
  createBodyContinuationState,
  MAX_BODY_PENETRATIONS_PER_PROJECTILE,
  resolveBodyPenetration,
} from './BodyPenetration';
import {
  MAX_STAGE3_CATCH_UP_STEPS,
  STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  type ProjectileRuntimeStateV3,
} from './ProjectileRuntimeTypes';
import {
  releaseProjectileSlotByIndex,
  syncProjectileRuntimeDiagnostics,
} from './ProjectileRuntime';
import {
  addIgnoredUnitId,
  applyPendingImpacts,
  applyPendingTerminations,
  clamp01,
  comparePendingImpacts,
  comparePendingTerminations,
  clearEventPrefix,
  createImpactFromCollision,
  createTerminationFromSlot,
  findMapExitFraction,
  finiteNonNegative,
  getScratch,
  ignoredPrefix,
  increment,
  incrementUint32,
  normalizeSmall,
  pointAtSlot,
  prepareTraceContext,
  queueImpact,
  queueTermination,
  recordBodyDiagnostics,
  refreshEventLedgers,
  setGridPoint,
  sortPrefix,
  velocityAtSlot,
  writeKinematics,
  type ProjectileStepperScratch,
} from './ProjectileStepperSupport';
import {
  applyQueuedSuppressionEvents,
  beginSuppressionEventSubstep,
} from './SuppressionEventBuffer';
import {
  queueImpactSuppression,
  queueNearMissSuppressionForSegment,
} from './SuppressionProjectileEvents';
import {
  MAX_SUPPRESSION_EVENTS_PER_PROJECTILE_SUBSTEP,
  SUPPRESSION_NEAR_MISS_RADIUS_METRES,
} from './SuppressionTypes';

const TIME_EPSILON_SECONDS = 1e-10;
const DISTANCE_EPSILON_METRES = 1e-7;
const PROJECTILE_UNIT_BROAD_PHASE_PADDING_METRES = SUPPRESSION_NEAR_MISS_RADIUS_METRES + 0.75;

export interface TickProjectileRuntimeInput {
  readonly intervalStartSeconds: number;
  readonly deltaSeconds: number;
}
export interface TickProjectileRuntimeResult {
  readonly executedSubsteps: number;
  readonly createdImpactIds: readonly string[];
  readonly createdTerminationIds: readonly string[];
}
const EMPTY_IDS = Object.freeze([]) as readonly string[];
const EMPTY_RESULT: TickProjectileRuntimeResult = Object.freeze({
  executedSubsteps: 0,
  createdImpactIds: EMPTY_IDS,
  createdTerminationIds: EMPTY_IDS,
});

export function tickProjectileRuntime(
  state: SimulationState,
  input: TickProjectileRuntimeInput,
): TickProjectileRuntimeResult {
  const runtime = state.infantryCombatProjectiles;
  if (runtime.pool.activeCount === 0) {
    runtime.accumulatorSeconds = 0;
    syncProjectileRuntimeDiagnostics(runtime);
    return EMPTY_RESULT;
  }
  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds);
  const deltaSeconds = finiteNonNegative(input.deltaSeconds);
  const previousAccumulatorSeconds = finiteNonNegative(runtime.accumulatorSeconds);
  runtime.accumulatorSeconds = normalizeSmall(previousAccumulatorSeconds + deltaSeconds);
  const availableSubsteps = Math.floor(
    (runtime.accumulatorSeconds + TIME_EPSILON_SECONDS) / STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  );
  const permittedSubsteps = Math.min(availableSubsteps, MAX_STAGE3_CATCH_UP_STEPS);
  if (availableSubsteps > permittedSubsteps) runtime.diagnostics.catchUpLimitedCount = increment(runtime.diagnostics.catchUpLimitedCount);
  const firstSubstepSeconds = Math.max(0, intervalStartSeconds - previousAccumulatorSeconds);
  const createdImpactIds: string[] = [];
  const createdTerminationIds: string[] = [];
  let executedSubsteps = 0;
  for (let index = 0; index < permittedSubsteps; index += 1) {
    if (runtime.pool.activeCount === 0) break;
    executeFixedSubstep(
      state,
      normalizeSmall(firstSubstepSeconds + index * STAGE3_PROJECTILE_FIXED_STEP_SECONDS),
      STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
      createdImpactIds,
      createdTerminationIds,
    );
    executedSubsteps += 1;
    runtime.accumulatorSeconds = normalizeSmall(Math.max(0, runtime.accumulatorSeconds - STAGE3_PROJECTILE_FIXED_STEP_SECONDS));
  }
  runtime.diagnostics.fixedSubstepsExecuted += executedSubsteps;
  if (runtime.pool.activeCount === 0) runtime.accumulatorSeconds = 0;
  syncProjectileRuntimeDiagnostics(runtime);
  return { executedSubsteps, createdImpactIds, createdTerminationIds };
}

function executeFixedSubstep(
  state: SimulationState,
  substepStartSeconds: number,
  fixedStepSeconds: number,
  createdImpactIds: string[],
  createdTerminationIds: string[],
): void {
  const runtime = state.infantryCombatProjectiles;
  const pool = runtime.pool;
  const scratch = getScratch(runtime);
  prepareTraceContext(state, scratch);
  refreshEventLedgers(runtime, scratch);
  beginSuppressionEventSubstep(runtime);
  scratch.impactCount = 0;
  scratch.terminationCount = 0;
  scratch.terminationQueuedBySlot.fill(0);
  const unitIndex = getCombatUnitSpatialIndex(state);
  let maximumImpacts = 0;
  for (let slot = 0; slot < pool.capacity; slot += 1) {
    if (pool.active[slot] !== 1) continue;
    maximumImpacts = Math.max(maximumImpacts, advanceProjectileThroughFixedSubstep(
      state,
      runtime,
      unitIndex,
      scratch,
      slot,
      substepStartSeconds,
      fixedStepSeconds,
    ));
  }
  sortPrefix(scratch.impactBuffer, scratch.impactCount, comparePendingImpacts);
  sortPrefix(scratch.terminationBuffer, scratch.terminationCount, comparePendingTerminations);
  applyPendingImpacts(runtime, unitIndex, scratch, createdImpactIds);
  applyQueuedSuppressionEvents(runtime, unitIndex);
  applyPendingTerminations(runtime, scratch, createdTerminationIds);
  runtime.diagnostics.maximumImpactsInSingleSubstep = Math.max(runtime.diagnostics.maximumImpactsInSingleSubstep, maximumImpacts);
  runtime.diagnostics.impactBufferHighWaterMark = Math.max(runtime.diagnostics.impactBufferHighWaterMark, scratch.impactCount);
  runtime.diagnostics.terminationBufferHighWaterMark = Math.max(runtime.diagnostics.terminationBufferHighWaterMark, scratch.terminationCount);
  clearEventPrefix(scratch.impactBuffer, scratch.impactCount);
  clearEventPrefix(scratch.terminationBuffer, scratch.terminationCount);
  scratch.impactCount = 0;
  scratch.terminationCount = 0;
}

export function advanceProjectileThroughFixedSubstep(
  state: SimulationState,
  runtime: ProjectileRuntimeStateV3,
  unitIndex: CombatUnitIndex,
  scratch: ProjectileStepperScratch,
  slot: number,
  substepStartSeconds: number,
  fixedStepSeconds: number,
): number {
  const pool = runtime.pool;
  let remainingSeconds = fixedStepSeconds;
  let elapsedSeconds = 0;
  let impactsInSubstep = 0;
  let suppressionEventsInSubstep = 0;
  scratch.ignoredUnitCount = 0;
  scratch.ignoredUnitIds.length = 0;
  const persistentLastHit = pool.lastHitUnitIds[slot];
  if (persistentLastHit) scratch.ignoredUnitIds[scratch.ignoredUnitCount++] = persistentLastHit;

  while (remainingSeconds > TIME_EPSILON_SECONDS && pool.active[slot] === 1) {
    const projectileId = pool.projectileIds[slot];
    const shotId = pool.shotIds[slot];
    const shooterId = pool.shooterIds[slot];
    const ammo = pool.ammoSnapshots[slot];
    if (!projectileId || !shotId || !shooterId || !ammo) {
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(runtime, slot, 'reconciled_orphan', substepStartSeconds + elapsedSeconds, pointAtSlot(runtime, slot)));
      break;
    }
    const lifetimeRemaining = Math.max(0, pool.maximumLifetimeSeconds[slot]! - pool.ageSeconds[slot]!);
    if (lifetimeRemaining <= TIME_EPSILON_SECONDS) {
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(runtime, slot, 'lifetime', substepStartSeconds + elapsedSeconds, pointAtSlot(runtime, slot)));
      break;
    }

    const segmentSeconds = Math.min(remainingSeconds, lifetimeRemaining);
    const start = pointAtSlot(runtime, slot);
    const velocityBefore = velocityAtSlot(runtime, slot);
    const end = {
      xMetres: start.xMetres + velocityBefore.x * segmentSeconds,
      yMetres: start.yMetres + velocityBefore.y * segmentSeconds,
      zMetres: start.zMetres + velocityBefore.z * segmentSeconds
        - 0.5 * STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * segmentSeconds * segmentSeconds,
    };
    const endVelocity = {
      x: velocityBefore.x,
      y: velocityBefore.y,
      z: velocityBefore.z - STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * segmentSeconds,
    };
    const deltaX = end.xMetres - start.xMetres;
    const deltaY = end.yMetres - start.yMetres;
    const deltaZ = end.zMetres - start.zMetres;
    const segmentDistance = Math.hypot(deltaX, deltaY, deltaZ);
    if (segmentDistance <= DISTANCE_EPSILON_METRES) {
      writeKinematics(runtime, slot, end, endVelocity, pool.ageSeconds[slot]! + segmentSeconds);
      remainingSeconds = normalizeSmall(remainingSeconds - segmentSeconds);
      elapsedSeconds = normalizeSmall(elapsedSeconds + segmentSeconds);
      pool.lastHitUnitIds[slot] = null;
      continue;
    }

    const boundary = findMapExitFraction(state, start.xMetres, start.yMetres, end.xMetres, end.yMetres);
    const traceFraction = boundary === null
      ? 1
      : Math.max(0, boundary - DISTANCE_EPSILON_METRES / Math.max(DISTANCE_EPSILON_METRES, segmentDistance));
    const traceDistanceMetres = segmentDistance * traceFraction;
    let collision: BallisticRayResult | null = null;
    if (traceDistanceMetres > DISTANCE_EPSILON_METRES) {
      queryUnitsNearBallisticSegmentInto(
        state,
        setGridPoint(scratch.unitQueryStartGrid, start.xMetres / state.map.metersPerCell, start.yMetres / state.map.metersPerCell),
        setGridPoint(scratch.unitQueryEndGrid, end.xMetres / state.map.metersPerCell, end.yMetres / state.map.metersPerCell),
        PROJECTILE_UNIT_BROAD_PHASE_PADDING_METRES,
        scratch.unitCandidates,
        scratch.unitQueryScratch,
        unitIndex,
      );
      runtime.diagnostics.unitBroadPhaseQueryCount += 1;
      runtime.diagnostics.unitCandidateCount += scratch.unitCandidates.length;
      const traceInput = scratch.traceInput;
      traceInput.shotId = shotId;
      traceInput.shooterId = shooterId;
      traceInput.origin.xMetres = start.xMetres;
      traceInput.origin.yMetres = start.yMetres;
      traceInput.origin.zMetres = start.zMetres;
      traceInput.direction.x = deltaX / segmentDistance;
      traceInput.direction.y = deltaY / segmentDistance;
      traceInput.direction.z = deltaZ / segmentDistance;
      traceInput.maximumDistanceMetres = traceDistanceMetres;
      traceInput.muzzleVelocityMetresPerSecond = Math.max(1, Math.hypot(velocityBefore.x, velocityBefore.y, velocityBefore.z));
      traceInput.ignoreUnitIds = ignoredPrefix(scratch);
      collision = traceBallisticRayPrepared(scratch.traceContext!, traceInput, scratch.traceScratch, scratch.traceResult, scratch.unitCandidates);
      runtime.diagnostics.sweptTraceCount += 1;
      runtime.diagnostics.unitNarrowCheckCount += collision.unitCheckCount;
      runtime.diagnostics.objectBroadPhaseQueryCount += 1;
      runtime.diagnostics.objectCandidateCount += collision.objectCandidateCount;
      runtime.diagnostics.terrainSampleCount += collision.terrainSampleCount;
    }

    const physicalFraction = collision && collision.hitType !== 'none'
      ? clamp01(collision.travelledMetres / segmentDistance)
      : traceFraction;
    const physicalEnd = {
      xMetres: start.xMetres + deltaX * physicalFraction,
      yMetres: start.yMetres + deltaY * physicalFraction,
      zMetres: start.zMetres + deltaZ * physicalFraction,
    };
    suppressionEventsInSubstep += queueNearMissSuppressionForSegment({
      state,
      runtime,
      unitIndex,
      candidates: scratch.unitCandidates,
      projectileId,
      shotId,
      shooterId,
      start,
      end: physicalEnd,
      segmentStartSeconds: substepStartSeconds + elapsedSeconds,
      segmentDurationSeconds: segmentSeconds * physicalFraction,
      velocity: velocityBefore,
      continuousFireScore: pool.suppressionContinuousFireScores[slot]!,
      directHitUnitId: collision?.hitType === 'unit' ? collision.hitUnitId : null,
      maximumEvents: Math.max(0, MAX_SUPPRESSION_EVENTS_PER_PROJECTILE_SUBSTEP - suppressionEventsInSubstep),
    });

    if (collision && collision.hitType !== 'none') {
      const entryFraction = clamp01(collision.travelledMetres / segmentDistance);
      const timeToEntry = segmentSeconds * entryFraction;
      const impactSeconds = normalizeSmall(substepStartSeconds + elapsedSeconds + timeToEntry);
      const impactAge = normalizeSmall(pool.ageSeconds[slot]! + timeToEntry);
      const velocityAtImpact = {
        x: velocityBefore.x,
        y: velocityBefore.y,
        z: velocityBefore.z - STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * timeToEntry,
      };
      const impactSequence = incrementUint32(pool.impactSequence[slot]!);
      pool.impactSequence[slot] = impactSequence;
      const bodyPhysics = collision.hitType === 'unit' && collision.hitUnitId && collision.hitZone && collision.unitIntersection
        ? resolveBodyPenetration({
            hitUnitId: collision.hitUnitId,
            hitZone: collision.hitZone,
            hitShapeId: collision.unitIntersection.shapeId,
            entryPoint: collision.unitIntersection.entryPoint,
            exitPoint: collision.unitIntersection.exitPoint,
            entryNormal: collision.unitIntersection.entryNormal,
            pathLengthMetres: collision.unitIntersection.pathLengthMetres,
            projectileMassKilograms: ammo.projectileMassKilograms,
            woundEffectMultiplier: ammo.woundEffectMultiplier,
            velocityBeforeMetresPerSecond: velocityAtImpact,
            penetrationBudgetBefore: pool.bodyPenetrationBudget[slot]!,
            penetrationCountBefore: pool.bodyPenetrationCount[slot]!,
          })
        : null;
      if (bodyPhysics) recordBodyDiagnostics(runtime, `${shotId}:impact:${impactSequence}`, bodyPhysics);
      const impact = createImpactFromCollision(
        state,
        runtime,
        scratch,
        slot,
        collision,
        bodyPhysics,
        impactSequence,
        impactSeconds,
        impactAge,
        velocityAtImpact,
      );
      queueImpact(runtime, scratch, impact);
      impactsInSubstep += 1;
      suppressionEventsInSubstep += queueImpactSuppression({
        state,
        runtime,
        unitIndex,
        impact,
        continuousFireScore: pool.suppressionContinuousFireScores[slot]!,
        maximumEvents: Math.max(0, MAX_SUPPRESSION_EVENTS_PER_PROJECTILE_SUBSTEP - suppressionEventsInSubstep),
      });

      if (bodyPhysics?.status === 'penetrated') {
        const continuation = createBodyContinuationState(bodyPhysics, velocityAtImpact);
        if (!continuation) {
          queueTermination(runtime, scratch, slot, createTerminationFromSlot(runtime, slot, 'impact', impactSeconds, impact.point));
          break;
        }
        const averageSpeed = Math.max(1, (bodyPhysics.speedBeforeMetresPerSecond + bodyPhysics.speedAfterMetresPerSecond) * 0.5);
        const bodyTravelSeconds = bodyPhysics.pathLengthMetres / averageSpeed;
        const consumed = Math.min(segmentSeconds, timeToEntry + bodyTravelSeconds);
        writeKinematics(runtime, slot, continuation.position, continuation.velocityMetresPerSecond, pool.ageSeconds[slot]! + consumed);
        pool.bodyPenetrationBudget[slot] = bodyPhysics.penetrationBudgetAfter;
        pool.bodyPenetrationCount[slot] = Math.min(255, bodyPhysics.penetrationCountAfter);
        pool.lastHitUnitIds[slot] = bodyPhysics.hitUnitId;
        addIgnoredUnitId(scratch, bodyPhysics.hitUnitId);
        remainingSeconds = normalizeSmall(Math.max(0, remainingSeconds - consumed));
        elapsedSeconds = normalizeSmall(elapsedSeconds + consumed);
        if (impactsInSubstep >= MAX_BODY_PENETRATIONS_PER_PROJECTILE) {
          queueTermination(runtime, scratch, slot, createTerminationFromSlot(runtime, slot, 'body_penetration_limit', impactSeconds, continuation.position));
          break;
        }
        continue;
      }
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(
        runtime,
        slot,
        bodyPhysics?.status === 'penetration_limit' ? 'body_penetration_limit' : 'impact',
        impactSeconds,
        impact.point,
      ));
      break;
    }

    if (boundary !== null) {
      const point = {
        xMetres: start.xMetres + (end.xMetres - start.xMetres) * boundary,
        yMetres: start.yMetres + (end.yMetres - start.yMetres) * boundary,
        zMetres: start.zMetres + (end.zMetres - start.zMetres) * boundary,
      };
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(
        runtime,
        slot,
        'out_of_bounds',
        substepStartSeconds + elapsedSeconds + segmentSeconds * boundary,
        point,
      ));
      break;
    }

    writeKinematics(runtime, slot, end, endVelocity, pool.ageSeconds[slot]! + segmentSeconds);
    pool.lastHitUnitIds[slot] = null;
    remainingSeconds = normalizeSmall(remainingSeconds - segmentSeconds);
    elapsedSeconds = normalizeSmall(elapsedSeconds + segmentSeconds);
    if (segmentSeconds + TIME_EPSILON_SECONDS >= lifetimeRemaining) {
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(runtime, slot, 'lifetime', substepStartSeconds + elapsedSeconds, end));
      break;
    }
  }
  return impactsInSubstep;
}
