import { createBallisticTraceContext, traceBallisticRay } from '../../combat/BallisticTrace';
import { normalizeDirection, type BallisticDirection3, type BallisticPoint3 } from '../../combat/UnitHitShapes';
import { getCell } from '../../map/MapModel';
import type { SimulationState } from '../../simulation/SimulationState';
import {
  MAX_STAGE3_APPLIED_IMPACT_IDS,
  MAX_STAGE3_CATCH_UP_STEPS,
  MAX_STAGE3_IMPACT_ENTRIES,
  MAX_STAGE3_TERMINATION_ENTRIES,
  PROJECTILE_IMPACT_SCHEMA_VERSION,
  PROJECTILE_TERMINATION_SCHEMA_VERSION,
  STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  type ProjectileImpactV1,
  type ProjectileStateV1,
  type ProjectileTerminationV1,
  type ReferenceProjectileRuntimeStateV1,
} from './ProjectileRuntimeTypes';

const TIME_EPSILON_SECONDS = 1e-10;
const DISTANCE_EPSILON_METRES = 1e-7;

export interface TickReferenceProjectilesInput {
  readonly intervalStartSeconds: number;
  readonly deltaSeconds: number;
}

export interface TickReferenceProjectilesResult {
  readonly executedSubsteps: number;
  readonly createdImpactIds: readonly string[];
  readonly createdTerminationIds: readonly string[];
}

/**
 * Stage 3 reference projectile stepper.
 *
 * It intentionally uses object-per-projectile storage and the existing unit scan in
 * BallisticTrace under a small explicit cap. Stage 4 replaces the storage and unit
 * broad phase without changing this fixed-step/exactly-once contract.
 */
export function tickReferenceProjectiles(
  state: Pick<SimulationState, 'map' | 'units' | 'infantryCombatProjectiles'>,
  input: TickReferenceProjectilesInput,
): TickReferenceProjectilesResult {
  const runtime = state.infantryCombatProjectiles;
  if (runtime.activeProjectiles.length === 0) {
    runtime.accumulatorSeconds = 0;
    return emptyResult();
  }

  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds);
  const deltaSeconds = finiteNonNegative(input.deltaSeconds);
  const previousAccumulatorSeconds = finiteNonNegative(runtime.accumulatorSeconds);
  runtime.accumulatorSeconds = previousAccumulatorSeconds + deltaSeconds;

  const availableSubsteps = Math.floor(
    (runtime.accumulatorSeconds + TIME_EPSILON_SECONDS) / STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  );
  const permittedSubsteps = Math.min(availableSubsteps, MAX_STAGE3_CATCH_UP_STEPS);
  const firstSubstepSeconds = Math.max(0, intervalStartSeconds - previousAccumulatorSeconds);
  const createdImpactIds: string[] = [];
  const createdTerminationIds: string[] = [];
  let executedSubsteps = 0;

  for (let index = 0; index < permittedSubsteps; index += 1) {
    if (runtime.activeProjectiles.length === 0) break;
    const substepStartSeconds = firstSubstepSeconds + index * STAGE3_PROJECTILE_FIXED_STEP_SECONDS;
    const result = executeFixedSubstep(state, substepStartSeconds, STAGE3_PROJECTILE_FIXED_STEP_SECONDS);
    createdImpactIds.push(...result.createdImpactIds);
    createdTerminationIds.push(...result.createdTerminationIds);
    executedSubsteps += 1;
    runtime.accumulatorSeconds = Math.max(
      0,
      runtime.accumulatorSeconds - STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    );
    if (runtime.accumulatorSeconds < TIME_EPSILON_SECONDS) runtime.accumulatorSeconds = 0;
  }

  runtime.diagnostics.fixedSubstepsExecuted += executedSubsteps;
  if (runtime.activeProjectiles.length === 0) {
    // Empty time cannot affect a projectile spawned later.
    runtime.accumulatorSeconds = 0;
  }

  return {
    executedSubsteps,
    createdImpactIds,
    createdTerminationIds,
  };
}

function executeFixedSubstep(
  state: Pick<SimulationState, 'map' | 'units' | 'infantryCombatProjectiles'>,
  substepStartSeconds: number,
  fixedStepSeconds: number,
): TickReferenceProjectilesResult {
  const runtime = state.infantryCombatProjectiles;
  const traceContext = createBallisticTraceContext(state.map, state.units);
  const survivors: ProjectileStateV1[] = [];
  const impacts: ProjectileImpactV1[] = [];
  const terminations: ProjectileTerminationV1[] = [];

  for (const original of [...runtime.activeProjectiles].sort(compareProjectiles)) {
    const projectile = structuredClone(original);
    const remainingLifetimeSeconds = Math.max(0, projectile.maximumLifetimeSeconds - projectile.ageSeconds);
    if (remainingLifetimeSeconds <= TIME_EPSILON_SECONDS) {
      terminations.push(createTermination(projectile, 'lifetime', substepStartSeconds, projectile.position));
      continue;
    }

    const stepSeconds = Math.min(fixedStepSeconds, remainingLifetimeSeconds);
    const start = projectile.position;
    const startVelocity = projectile.velocityMetresPerSecond;
    const end = integratePosition(start, startVelocity, stepSeconds);
    const endVelocity = integrateVelocity(startVelocity, stepSeconds);
    const segment = directionAndDistance(start, end);
    const boundary = findMapExitFraction(state.map, start, end);
    const traceFraction = boundary === null
      ? 1
      : Math.max(0, boundary - DISTANCE_EPSILON_METRES / Math.max(DISTANCE_EPSILON_METRES, segment.distanceMetres));
    const traceDistanceMetres = segment.distanceMetres * traceFraction;
    let collision: ReturnType<typeof traceBallisticRay> | null = null;

    if (traceDistanceMetres > DISTANCE_EPSILON_METRES) {
      collision = traceBallisticRay(traceContext, {
        shotId: projectile.shotId,
        shooterId: projectile.shooterId,
        origin: start,
        direction: segment.direction,
        maximumDistanceMetres: traceDistanceMetres,
        muzzleVelocityMetresPerSecond: Math.max(1, magnitude(startVelocity)),
      });
      runtime.diagnostics.sweptTraceCount += 1;
      runtime.diagnostics.unitCheckCount += collision.unitCheckCount;
      runtime.diagnostics.objectCandidateCount += collision.objectCandidateCount;
    }

    if (collision && collision.hitType !== 'none') {
      const impactFraction = segment.distanceMetres <= DISTANCE_EPSILON_METRES
        ? 0
        : collision.travelledMetres / segment.distanceMetres;
      const impactSeconds = substepStartSeconds + stepSeconds * clamp01(impactFraction);
      const impactVelocity = integrateVelocity(startVelocity, stepSeconds * clamp01(impactFraction));
      const impact = createImpact(state, projectile, collision, impactSeconds, impactVelocity);
      if (!runtime.appliedImpactIds.includes(impact.impactId)) impacts.push(impact);
      terminations.push(createTermination(projectile, 'impact', impactSeconds, collision.impactPoint));
      continue;
    }

    if (boundary !== null) {
      const point = interpolatePoint(start, end, boundary);
      const terminationSeconds = substepStartSeconds + stepSeconds * boundary;
      terminations.push(createTermination(projectile, 'out_of_bounds', terminationSeconds, point));
      continue;
    }

    projectile.position = end;
    projectile.velocityMetresPerSecond = endVelocity;
    projectile.ageSeconds = normalizeSmall(projectile.ageSeconds + stepSeconds);
    if (remainingLifetimeSeconds <= fixedStepSeconds + TIME_EPSILON_SECONDS) {
      terminations.push(createTermination(projectile, 'lifetime', substepStartSeconds + stepSeconds, end));
      continue;
    }
    survivors.push(projectile);
  }

  applyEvents(runtime, impacts, terminations);
  runtime.activeProjectiles = survivors.sort(compareProjectiles);
  return {
    executedSubsteps: 1,
    createdImpactIds: impacts.map((impact) => impact.impactId),
    createdTerminationIds: terminations.map((termination) => termination.terminationId),
  };
}

function createImpact(
  state: Pick<SimulationState, 'map'>,
  projectile: ProjectileStateV1,
  collision: ReturnType<typeof traceBallisticRay>,
  simulationSeconds: number,
  velocityBeforeImpact: BallisticDirection3,
): ProjectileImpactV1 {
  const impactId = `${projectile.shotId}:impact:${projectile.impactSequence + 1}`;
  const object = collision.hitObjectId
    ? state.map.objects.find((candidate) => candidate.id === collision.hitObjectId)
    : undefined;
  const cell = getCell(
    state.map,
    Math.floor(collision.impactGridPosition.x),
    Math.floor(collision.impactGridPosition.y),
  );
  return {
    schemaVersion: PROJECTILE_IMPACT_SCHEMA_VERSION,
    impactId,
    projectileId: projectile.projectileId,
    shotId: projectile.shotId,
    shooterId: projectile.shooterId,
    impactType: collision.hitType as ProjectileImpactV1['impactType'],
    simulationSeconds: normalizeSmall(simulationSeconds),
    point: structuredClone(collision.impactPoint),
    hitObjectId: collision.hitObjectId ?? null,
    hitUnitId: collision.hitUnitId ?? null,
    hitZone: collision.hitZone ?? null,
    materialId: collision.hitType === 'terrain'
      ? cell?.surfaceMaterialId ?? null
      : collision.hitType === 'object'
        ? `map_object:${object?.kind ?? 'unknown'}`
        : null,
    normal: null,
    velocityBeforeImpact: structuredClone(velocityBeforeImpact),
  };
}

function createTermination(
  projectile: ProjectileStateV1,
  reason: ProjectileTerminationV1['reason'],
  simulationSeconds: number,
  point: BallisticPoint3,
): ProjectileTerminationV1 {
  return {
    schemaVersion: PROJECTILE_TERMINATION_SCHEMA_VERSION,
    terminationId: `${projectile.shotId}:termination`,
    projectileId: projectile.projectileId,
    shotId: projectile.shotId,
    reason,
    simulationSeconds: normalizeSmall(simulationSeconds),
    point: structuredClone(point),
  };
}

function applyEvents(
  runtime: ReferenceProjectileRuntimeStateV1,
  pendingImpacts: ProjectileImpactV1[],
  pendingTerminations: ProjectileTerminationV1[],
): void {
  for (const impact of pendingImpacts.sort(compareImpacts)) {
    if (runtime.appliedImpactIds.includes(impact.impactId)) continue;
    runtime.appliedImpactIds = [...runtime.appliedImpactIds, impact.impactId]
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort(compareText)
      .slice(-MAX_STAGE3_APPLIED_IMPACT_IDS);
    runtime.impacts = [...runtime.impacts, structuredClone(impact)]
      .sort(compareImpacts)
      .slice(-MAX_STAGE3_IMPACT_ENTRIES);
    runtime.diagnostics.lastImpactId = impact.impactId;
  }
  for (const termination of pendingTerminations.sort(compareTerminations)) {
    if (runtime.terminations.some((item) => item.terminationId === termination.terminationId)) continue;
    runtime.terminations = [...runtime.terminations, structuredClone(termination)]
      .sort(compareTerminations)
      .slice(-MAX_STAGE3_TERMINATION_ENTRIES);
    runtime.diagnostics.lastTerminationId = termination.terminationId;
  }
}

function integratePosition(
  position: BallisticPoint3,
  velocity: BallisticDirection3,
  deltaSeconds: number,
): BallisticPoint3 {
  return {
    xMetres: position.xMetres + velocity.x * deltaSeconds,
    yMetres: position.yMetres + velocity.y * deltaSeconds,
    zMetres: position.zMetres
      + velocity.z * deltaSeconds
      - 0.5 * STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * deltaSeconds * deltaSeconds,
  };
}

function integrateVelocity(
  velocity: BallisticDirection3,
  deltaSeconds: number,
): BallisticDirection3 {
  return {
    x: velocity.x,
    y: velocity.y,
    z: velocity.z - STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * deltaSeconds,
  };
}

function directionAndDistance(
  start: BallisticPoint3,
  end: BallisticPoint3,
): { direction: BallisticDirection3; distanceMetres: number } {
  const delta = {
    x: end.xMetres - start.xMetres,
    y: end.yMetres - start.yMetres,
    z: end.zMetres - start.zMetres,
  };
  return {
    direction: normalizeDirection(delta),
    distanceMetres: magnitude(delta),
  };
}

function findMapExitFraction(
  map: Pick<SimulationState['map'], 'width' | 'height' | 'metersPerCell'>,
  start: BallisticPoint3,
  end: BallisticPoint3,
): number | null {
  const maximumX = map.width * map.metersPerCell;
  const maximumY = map.height * map.metersPerCell;
  const candidates: number[] = [];
  collectBoundaryFraction(candidates, start.xMetres, end.xMetres, 0, maximumX);
  collectBoundaryFraction(candidates, start.yMetres, end.yMetres, 0, maximumY);
  const valid = candidates.filter((value) => value >= 0 && value <= 1).sort((a, b) => a - b);
  return valid[0] ?? null;
}

function collectBoundaryFraction(
  target: number[],
  start: number,
  end: number,
  minimum: number,
  maximum: number,
): void {
  if (end < minimum && start >= minimum) target.push((minimum - start) / (end - start));
  if (end >= maximum && start < maximum) target.push((maximum - start) / (end - start));
}

function interpolatePoint(start: BallisticPoint3, end: BallisticPoint3, fraction: number): BallisticPoint3 {
  return {
    xMetres: start.xMetres + (end.xMetres - start.xMetres) * fraction,
    yMetres: start.yMetres + (end.yMetres - start.yMetres) * fraction,
    zMetres: start.zMetres + (end.zMetres - start.zMetres) * fraction,
  };
}

function magnitude(vector: BallisticDirection3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function compareProjectiles(left: ProjectileStateV1, right: ProjectileStateV1): number {
  return compareText(left.projectileId, right.projectileId);
}

function compareImpacts(left: ProjectileImpactV1, right: ProjectileImpactV1): number {
  return left.simulationSeconds - right.simulationSeconds || compareText(left.impactId, right.impactId);
}

function compareTerminations(left: ProjectileTerminationV1, right: ProjectileTerminationV1): number {
  return left.simulationSeconds - right.simulationSeconds || compareText(left.terminationId, right.terminationId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeSmall(value: number): number {
  if (Math.abs(value) < TIME_EPSILON_SECONDS) return 0;
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function emptyResult(): TickReferenceProjectilesResult {
  return {
    executedSubsteps: 0,
    createdImpactIds: [],
    createdTerminationIds: [],
  };
}
