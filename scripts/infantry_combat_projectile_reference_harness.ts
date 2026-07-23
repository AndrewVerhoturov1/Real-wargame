import { createBallisticTraceContext, traceBallisticRay } from '../src/core/combat/BallisticTrace';
import { queryUnitsNearBallisticSegment } from '../src/core/combat/CombatUnitSpatialIndex';
import { normalizeDirection, type BallisticDirection3, type BallisticPoint3 } from '../src/core/combat/UnitHitShapes';
import { getCell } from '../src/core/map/MapModel';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  MAX_STAGE3_CATCH_UP_STEPS,
  PROJECTILE_IMPACT_SCHEMA_VERSION,
  PROJECTILE_TERMINATION_SCHEMA_VERSION,
  STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  type ProjectileImpactV1,
  type ProjectileStateV1,
  type ProjectileTerminationV1,
} from '../src/core/infantry-combat/runtime';

const TIME_EPSILON_SECONDS = 1e-10;
const DISTANCE_EPSILON_METRES = 1e-7;
const BROAD_PHASE_PADDING_METRES = 2;

export interface Stage3ReferenceHarnessRuntime {
  accumulatorSeconds: number;
  activeProjectiles: ProjectileStateV1[];
  impacts: ProjectileImpactV1[];
  terminations: ProjectileTerminationV1[];
  appliedImpactIds: string[];
  diagnostics: {
    fixedSubstepsExecuted: number;
    sweptTraceCount: number;
    unitCheckCount: number;
    objectCandidateCount: number;
    structuredCloneCount: number;
    survivorsArrayCount: number;
    eventArrayCount: number;
    projectileSubsteps: number;
  };
}

export interface Stage3ReferenceTickResult {
  readonly executedSubsteps: number;
  readonly createdImpactIds: readonly string[];
  readonly createdTerminationIds: readonly string[];
}

export function createStage3ReferenceHarnessRuntime(
  projectiles: readonly ProjectileStateV1[] = [],
): Stage3ReferenceHarnessRuntime {
  return {
    accumulatorSeconds: 0,
    activeProjectiles: projectiles.map(clone).sort(compareProjectiles),
    impacts: [],
    terminations: [],
    appliedImpactIds: [],
    diagnostics: {
      fixedSubstepsExecuted: 0,
      sweptTraceCount: 0,
      unitCheckCount: 0,
      objectCandidateCount: 0,
      structuredCloneCount: 0,
      survivorsArrayCount: 0,
      eventArrayCount: 0,
      projectileSubsteps: 0,
    },
  };
}

export function tickStage3ReferenceHarness(
  state: SimulationState,
  runtime: Stage3ReferenceHarnessRuntime,
  intervalStartSeconds: number,
  deltaSeconds: number,
): Stage3ReferenceTickResult {
  if (runtime.activeProjectiles.length === 0) {
    runtime.accumulatorSeconds = 0;
    return { executedSubsteps: 0, createdImpactIds: [], createdTerminationIds: [] };
  }
  const previousAccumulatorSeconds = finiteNonNegative(runtime.accumulatorSeconds);
  runtime.accumulatorSeconds = previousAccumulatorSeconds + finiteNonNegative(deltaSeconds);
  const available = Math.floor((runtime.accumulatorSeconds + TIME_EPSILON_SECONDS) / STAGE3_PROJECTILE_FIXED_STEP_SECONDS);
  const permitted = Math.min(available, MAX_STAGE3_CATCH_UP_STEPS);
  const firstSubstepSeconds = Math.max(0, finiteNonNegative(intervalStartSeconds) - previousAccumulatorSeconds);
  const createdImpactIds: string[] = [];
  const createdTerminationIds: string[] = [];
  let executedSubsteps = 0;
  for (let index = 0; index < permitted; index += 1) {
    if (runtime.activeProjectiles.length === 0) break;
    const result = executeSubstep(
      state,
      runtime,
      firstSubstepSeconds + index * STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
      STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    );
    createdImpactIds.push(...result.createdImpactIds);
    createdTerminationIds.push(...result.createdTerminationIds);
    executedSubsteps += 1;
    runtime.accumulatorSeconds = Math.max(0, runtime.accumulatorSeconds - STAGE3_PROJECTILE_FIXED_STEP_SECONDS);
    if (runtime.accumulatorSeconds < TIME_EPSILON_SECONDS) runtime.accumulatorSeconds = 0;
  }
  runtime.diagnostics.fixedSubstepsExecuted += executedSubsteps;
  if (runtime.activeProjectiles.length === 0) runtime.accumulatorSeconds = 0;
  return { executedSubsteps, createdImpactIds, createdTerminationIds };
}

function executeSubstep(
  state: SimulationState,
  runtime: Stage3ReferenceHarnessRuntime,
  substepStartSeconds: number,
  fixedStepSeconds: number,
): Stage3ReferenceTickResult {
  const survivors: ProjectileStateV1[] = [];
  const impacts: ProjectileImpactV1[] = [];
  const terminations: ProjectileTerminationV1[] = [];
  runtime.diagnostics.survivorsArrayCount += 1;
  runtime.diagnostics.eventArrayCount += 2;
  runtime.diagnostics.projectileSubsteps += runtime.activeProjectiles.length;

  for (const original of [...runtime.activeProjectiles].sort(compareProjectiles)) {
    const projectile = clone(original);
    runtime.diagnostics.structuredCloneCount += 1;
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
    const boundary = findMapExitFraction(state, start, end);
    const traceFraction = boundary === null
      ? 1
      : Math.max(0, boundary - DISTANCE_EPSILON_METRES / Math.max(DISTANCE_EPSILON_METRES, segment.distanceMetres));
    const traceDistanceMetres = segment.distanceMetres * traceFraction;
    let collision: ReturnType<typeof traceBallisticRay> | null = null;
    if (traceDistanceMetres > DISTANCE_EPSILON_METRES) {
      const metresPerCell = Math.max(0.001, state.map.metersPerCell);
      const unitCandidates = queryUnitsNearBallisticSegment(
        state,
        { x: start.xMetres / metresPerCell, y: start.yMetres / metresPerCell },
        { x: end.xMetres / metresPerCell, y: end.yMetres / metresPerCell },
        BROAD_PHASE_PADDING_METRES,
      );
      collision = traceBallisticRay(createBallisticTraceContext(state.map, unitCandidates), {
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
      const safeFraction = clamp01(impactFraction);
      const impactSeconds = substepStartSeconds + stepSeconds * safeFraction;
      const impactVelocity = integrateVelocity(startVelocity, stepSeconds * safeFraction);
      const projectileAgeSeconds = normalizeSmall(projectile.ageSeconds + stepSeconds * safeFraction);
      const impact = createImpact(state, projectile, collision, impactSeconds, projectileAgeSeconds, impactVelocity);
      if (!runtime.appliedImpactIds.includes(impact.impactId)) impacts.push(impact);
      terminations.push(createTermination(projectile, 'impact', impactSeconds, collision.impactPoint));
      continue;
    }
    if (boundary !== null) {
      const point = interpolatePoint(start, end, boundary);
      terminations.push(createTermination(
        projectile,
        'out_of_bounds',
        substepStartSeconds + stepSeconds * boundary,
        point,
      ));
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

  for (const impact of impacts.sort(compareImpacts)) {
    if (runtime.appliedImpactIds.includes(impact.impactId)) continue;
    runtime.appliedImpactIds.push(impact.impactId);
    runtime.appliedImpactIds.sort(compareText);
    runtime.impacts.push(clone(impact));
    runtime.impacts.sort(compareImpacts);
  }
  for (const termination of terminations.sort(compareTerminations)) {
    if (runtime.terminations.some((item) => item.terminationId === termination.terminationId)) continue;
    runtime.terminations.push(clone(termination));
    runtime.terminations.sort(compareTerminations);
  }
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
  impactSeconds: number,
  projectileAgeSeconds: number,
  velocityBeforeImpact: BallisticDirection3,
): ProjectileImpactV1 {
  const object = collision.hitObjectId
    ? state.map.objects.find((candidate) => candidate.id === collision.hitObjectId)
    : undefined;
  const cell = getCell(state.map, Math.floor(collision.impactGridPosition.x), Math.floor(collision.impactGridPosition.y));
  return {
    schemaVersion: PROJECTILE_IMPACT_SCHEMA_VERSION,
    impactId: `${projectile.shotId}:impact:${projectile.impactSequence + 1}`,
    projectileId: projectile.projectileId,
    shotId: projectile.shotId,
    shooterId: projectile.shooterId,
    hitType: collision.hitType as ProjectileImpactV1['hitType'],
    impactSeconds: normalizeSmall(impactSeconds),
    projectileAgeSeconds: normalizeSmall(projectileAgeSeconds),
    point: clone(collision.impactPoint),
    hitObjectId: collision.hitObjectId ?? null,
    hitUnitId: collision.hitUnitId ?? null,
    hitZone: collision.hitZone ?? null,
    materialId: collision.hitType === 'terrain'
      ? cell?.surfaceMaterialId ?? null
      : collision.hitType === 'object'
        ? `map_object:${object?.kind ?? 'unknown'}`
        : null,
    normal: null,
    velocityBeforeImpact: clone(velocityBeforeImpact),
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
    point: clone(point),
  };
}

function integratePosition(position: BallisticPoint3, velocity: BallisticDirection3, deltaSeconds: number): BallisticPoint3 {
  return {
    xMetres: position.xMetres + velocity.x * deltaSeconds,
    yMetres: position.yMetres + velocity.y * deltaSeconds,
    zMetres: position.zMetres + velocity.z * deltaSeconds
      - 0.5 * STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * deltaSeconds * deltaSeconds,
  };
}

function integrateVelocity(velocity: BallisticDirection3, deltaSeconds: number): BallisticDirection3 {
  return { x: velocity.x, y: velocity.y, z: velocity.z - STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * deltaSeconds };
}

function directionAndDistance(start: BallisticPoint3, end: BallisticPoint3): { direction: BallisticDirection3; distanceMetres: number } {
  const delta = { x: end.xMetres - start.xMetres, y: end.yMetres - start.yMetres, z: end.zMetres - start.zMetres };
  return { direction: normalizeDirection(delta), distanceMetres: magnitude(delta) };
}

function findMapExitFraction(
  state: Pick<SimulationState, 'map'>,
  start: BallisticPoint3,
  end: BallisticPoint3,
): number | null {
  const maximumX = state.map.width * state.map.metersPerCell;
  const maximumY = state.map.height * state.map.metersPerCell;
  const candidates: number[] = [];
  collectBoundaryFraction(candidates, start.xMetres, end.xMetres, 0, maximumX);
  collectBoundaryFraction(candidates, start.yMetres, end.yMetres, 0, maximumY);
  const valid = candidates.filter((value) => value >= 0 && value <= 1).sort((a, b) => a - b);
  return valid[0] ?? null;
}

function collectBoundaryFraction(target: number[], start: number, end: number, minimum: number, maximum: number): void {
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

function magnitude(value: BallisticDirection3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function compareProjectiles(left: ProjectileStateV1, right: ProjectileStateV1): number {
  return compareText(left.projectileId, right.projectileId);
}
function compareImpacts(left: ProjectileImpactV1, right: ProjectileImpactV1): number {
  return left.impactSeconds - right.impactSeconds || compareText(left.impactId, right.impactId);
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
function clone<T>(value: T): T {
  return structuredClone(value);
}
