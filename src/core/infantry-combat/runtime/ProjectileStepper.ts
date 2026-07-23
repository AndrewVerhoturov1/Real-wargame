import {
  createBallisticTraceContext,
  createBallisticTraceScratch,
  createEmptyBallisticRayResult,
  traceBallisticRayPrepared,
  type BallisticRayInput,
  type BallisticRayResult,
  type BallisticTraceContext,
  type BallisticTraceScratch,
} from '../../combat/BallisticTrace';
import {
  createCombatUnitSpatialQueryScratch,
  getCombatUnitSpatialIndex,
  queryUnitsNearBallisticSegmentInto,
  type CombatUnitSpatialQueryScratch,
} from '../../combat/CombatUnitSpatialIndex';
import { getCell } from '../../map/MapModel';
import { getMapObjectSpatialIndex } from '../../spatial/MapObjectSpatialIndex';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
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
  type ProjectileRuntimeStateV2,
  type ProjectileTerminationV1,
} from './ProjectileRuntimeTypes';
import {
  releaseProjectileSlotByIndex,
  syncProjectileRuntimeDiagnostics,
} from './ProjectileRuntime';

const TIME_EPSILON_SECONDS = 1e-10;
const DISTANCE_EPSILON_METRES = 1e-7;
const PROJECTILE_UNIT_BROAD_PHASE_PADDING_METRES = 2;

export interface TickProjectileRuntimeInput {
  readonly intervalStartSeconds: number;
  readonly deltaSeconds: number;
}

export interface TickProjectileRuntimeResult {
  readonly executedSubsteps: number;
  readonly createdImpactIds: readonly string[];
  readonly createdTerminationIds: readonly string[];
}

interface PendingImpact {
  readonly slot: number;
  readonly generation: number;
  readonly impact: ProjectileImpactV1;
}

interface PendingTermination {
  readonly slot: number;
  readonly generation: number;
  readonly termination: ProjectileTerminationV1;
}

interface ProjectileStepperScratch {
  mapIdentity: SimulationState['map'] | null;
  traceContext: BallisticTraceContext | null;
  readonly traceScratch: BallisticTraceScratch;
  readonly traceResult: BallisticRayResult;
  readonly traceInput: BallisticRayInput;
  readonly unitCandidates: UnitModel[];
  readonly unitQueryScratch: CombatUnitSpatialQueryScratch;
  readonly unitQueryStartGrid: { x: number; y: number };
  readonly unitQueryEndGrid: { x: number; y: number };
  readonly impactBuffer: Array<PendingImpact | null>;
  readonly terminationBuffer: Array<PendingTermination | null>;
  impactCount: number;
  terminationCount: number;
  readonly appliedImpactIds: Set<string>;
  readonly terminationIds: Set<string>;
  appliedImpactCount: number;
  terminationLedgerCount: number;
}

const scratchByRuntime = new WeakMap<ProjectileRuntimeStateV2, ProjectileStepperScratch>();
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
  runtime.accumulatorSeconds = previousAccumulatorSeconds + deltaSeconds;
  const availableSubsteps = Math.floor(
    (runtime.accumulatorSeconds + TIME_EPSILON_SECONDS) / STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  );
  const permittedSubsteps = Math.min(availableSubsteps, MAX_STAGE3_CATCH_UP_STEPS);
  if (availableSubsteps > permittedSubsteps) {
    runtime.diagnostics.catchUpLimitedCount = increment(runtime.diagnostics.catchUpLimitedCount);
  }
  const firstSubstepSeconds = Math.max(0, intervalStartSeconds - previousAccumulatorSeconds);
  const createdImpactIds: string[] = [];
  const createdTerminationIds: string[] = [];
  let executedSubsteps = 0;

  for (let index = 0; index < permittedSubsteps; index += 1) {
    if (runtime.pool.activeCount === 0) break;
    const substepStartSeconds = firstSubstepSeconds + index * STAGE3_PROJECTILE_FIXED_STEP_SECONDS;
    executeFixedSubstep(
      state,
      substepStartSeconds,
      STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
      createdImpactIds,
      createdTerminationIds,
    );
    executedSubsteps += 1;
    runtime.accumulatorSeconds = Math.max(
      0,
      runtime.accumulatorSeconds - STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
    );
    if (runtime.accumulatorSeconds < TIME_EPSILON_SECONDS) runtime.accumulatorSeconds = 0;
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
  scratch.impactCount = 0;
  scratch.terminationCount = 0;
  const unitIndex = getCombatUnitSpatialIndex(state);
  const metresPerCell = Math.max(0.001, state.map.metersPerCell);

  for (let slot = 0; slot < pool.capacity; slot += 1) {
    if (pool.active[slot] !== 1) continue;
    const projectileId = pool.projectileIds[slot];
    const shotId = pool.shotIds[slot];
    const shooterId = pool.shooterIds[slot];
    if (!projectileId || !shotId || !shooterId || !pool.ammoSnapshots[slot]) {
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(
        runtime,
        slot,
        'reconciled_orphan',
        substepStartSeconds,
        pool.positionX[slot]!,
        pool.positionY[slot]!,
        pool.positionZ[slot]!,
      ));
      continue;
    }

    const remainingLifetimeSeconds = Math.max(0, pool.maximumLifetimeSeconds[slot]! - pool.ageSeconds[slot]!);
    if (remainingLifetimeSeconds <= TIME_EPSILON_SECONDS) {
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(
        runtime,
        slot,
        'lifetime',
        substepStartSeconds,
        pool.positionX[slot]!,
        pool.positionY[slot]!,
        pool.positionZ[slot]!,
      ));
      continue;
    }

    const stepSeconds = Math.min(fixedStepSeconds, remainingLifetimeSeconds);
    const startX = pool.positionX[slot]!;
    const startY = pool.positionY[slot]!;
    const startZ = pool.positionZ[slot]!;
    const velocityX = pool.velocityX[slot]!;
    const velocityY = pool.velocityY[slot]!;
    const velocityZ = pool.velocityZ[slot]!;
    const endX = startX + velocityX * stepSeconds;
    const endY = startY + velocityY * stepSeconds;
    const endZ = startZ + velocityZ * stepSeconds
      - 0.5 * STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * stepSeconds * stepSeconds;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const deltaZ = endZ - startZ;
    const segmentDistance = Math.hypot(deltaX, deltaY, deltaZ);
    const inverseDistance = segmentDistance > DISTANCE_EPSILON_METRES ? 1 / segmentDistance : 0;
    const boundary = findMapExitFraction(state, startX, startY, endX, endY);
    const traceFraction = boundary === null
      ? 1
      : Math.max(0, boundary - DISTANCE_EPSILON_METRES / Math.max(DISTANCE_EPSILON_METRES, segmentDistance));
    const traceDistanceMetres = segmentDistance * traceFraction;
    let collision: BallisticRayResult | null = null;

    if (traceDistanceMetres > DISTANCE_EPSILON_METRES) {
      const unitCount = queryUnitsNearBallisticSegmentInto(
        state,
        setGridPoint(scratch.unitQueryStartGrid, startX / metresPerCell, startY / metresPerCell),
        setGridPoint(scratch.unitQueryEndGrid, endX / metresPerCell, endY / metresPerCell),
        PROJECTILE_UNIT_BROAD_PHASE_PADDING_METRES,
        scratch.unitCandidates,
        scratch.unitQueryScratch,
        unitIndex,
      );
      runtime.diagnostics.unitBroadPhaseQueryCount += 1;
      runtime.diagnostics.unitCandidateCount += unitCount;
      const traceInput = scratch.traceInput;
      traceInput.shotId = shotId;
      traceInput.shooterId = shooterId;
      traceInput.origin.xMetres = startX;
      traceInput.origin.yMetres = startY;
      traceInput.origin.zMetres = startZ;
      traceInput.direction.x = deltaX * inverseDistance;
      traceInput.direction.y = deltaY * inverseDistance;
      traceInput.direction.z = deltaZ * inverseDistance;
      traceInput.maximumDistanceMetres = traceDistanceMetres;
      traceInput.muzzleVelocityMetresPerSecond = Math.max(1, Math.hypot(velocityX, velocityY, velocityZ));
      collision = traceBallisticRayPrepared(
        scratch.traceContext!,
        traceInput,
        scratch.traceScratch,
        scratch.traceResult,
        scratch.unitCandidates,
      );
      runtime.diagnostics.sweptTraceCount += 1;
      runtime.diagnostics.objectBroadPhaseQueryCount += 1;
      runtime.diagnostics.objectCandidateCount += collision.objectCandidateCount;
      runtime.diagnostics.unitNarrowCheckCount += collision.unitCheckCount;
      runtime.diagnostics.terrainSampleCount += collision.terrainSampleCount;
    }

    if (collision && collision.hitType !== 'none') {
      const impactFraction = segmentDistance <= DISTANCE_EPSILON_METRES
        ? 0
        : collision.travelledMetres / segmentDistance;
      const safeFraction = clamp01(impactFraction);
      const impactSeconds = substepStartSeconds + stepSeconds * safeFraction;
      const impactVelocityZ = velocityZ - STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * stepSeconds * safeFraction;
      const projectileAgeSeconds = normalizeSmall(pool.ageSeconds[slot]! + stepSeconds * safeFraction);
      const impact = createImpactFromSlot(
        state,
        runtime,
        slot,
        collision,
        impactSeconds,
        projectileAgeSeconds,
        velocityX,
        velocityY,
        impactVelocityZ,
        scratch,
      );
      if (!scratch.appliedImpactIds.has(impact.impactId)) queueImpact(runtime, scratch, slot, impact);
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(
        runtime,
        slot,
        'impact',
        impactSeconds,
        collision.impactPoint.xMetres,
        collision.impactPoint.yMetres,
        collision.impactPoint.zMetres,
      ));
      continue;
    }

    if (boundary !== null) {
      const pointX = startX + (endX - startX) * boundary;
      const pointY = startY + (endY - startY) * boundary;
      const pointZ = startZ + (endZ - startZ) * boundary;
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(
        runtime,
        slot,
        'out_of_bounds',
        substepStartSeconds + stepSeconds * boundary,
        pointX,
        pointY,
        pointZ,
      ));
      continue;
    }

    pool.positionX[slot] = endX;
    pool.positionY[slot] = endY;
    pool.positionZ[slot] = endZ;
    pool.velocityZ[slot] = velocityZ - STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * stepSeconds;
    pool.ageSeconds[slot] = normalizeSmall(pool.ageSeconds[slot]! + stepSeconds);
    if (remainingLifetimeSeconds <= fixedStepSeconds + TIME_EPSILON_SECONDS) {
      queueTermination(runtime, scratch, slot, createTerminationFromSlot(
        runtime,
        slot,
        'lifetime',
        substepStartSeconds + stepSeconds,
        endX,
        endY,
        endZ,
      ));
    }
  }

  sortPrefix(scratch.impactBuffer, scratch.impactCount, comparePendingImpacts);
  sortPrefix(scratch.terminationBuffer, scratch.terminationCount, comparePendingTerminations);
  applyPendingImpacts(runtime, scratch, createdImpactIds);
  applyPendingTerminations(runtime, scratch, createdTerminationIds);
  runtime.diagnostics.impactBufferHighWaterMark = Math.max(
    runtime.diagnostics.impactBufferHighWaterMark,
    scratch.impactCount,
  );
  runtime.diagnostics.terminationBufferHighWaterMark = Math.max(
    runtime.diagnostics.terminationBufferHighWaterMark,
    scratch.terminationCount,
  );
  clearEventPrefix(scratch.impactBuffer, scratch.impactCount);
  clearEventPrefix(scratch.terminationBuffer, scratch.terminationCount);
  scratch.impactCount = 0;
  scratch.terminationCount = 0;
}

function prepareTraceContext(state: SimulationState, scratch: ProjectileStepperScratch): void {
  const objectIndex = getMapObjectSpatialIndex(state.map);
  if (
    scratch.mapIdentity !== state.map
    || scratch.traceContext === null
    || scratch.traceContext.objectSpatialIndex !== objectIndex
  ) {
    scratch.mapIdentity = state.map;
    scratch.traceContext = createBallisticTraceContext(state.map, []);
  }
}

function getScratch(runtime: ProjectileRuntimeStateV2): ProjectileStepperScratch {
  let scratch = scratchByRuntime.get(runtime);
  if (scratch) return scratch;
  const capacity = runtime.pool.capacity;
  scratch = {
    mapIdentity: null,
    traceContext: null,
    traceScratch: createBallisticTraceScratch(),
    traceResult: createEmptyBallisticRayResult(),
    traceInput: {
      shotId: '',
      shooterId: '',
      origin: { xMetres: 0, yMetres: 0, zMetres: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maximumDistanceMetres: 0,
      muzzleVelocityMetresPerSecond: 1,
    },
    unitCandidates: [],
    unitQueryScratch: createCombatUnitSpatialQueryScratch(),
    unitQueryStartGrid: { x: 0, y: 0 },
    unitQueryEndGrid: { x: 0, y: 0 },
    impactBuffer: Array<PendingImpact | null>(capacity).fill(null),
    terminationBuffer: Array<PendingTermination | null>(capacity).fill(null),
    impactCount: 0,
    terminationCount: 0,
    appliedImpactIds: new Set(runtime.appliedImpactIds),
    terminationIds: new Set(runtime.terminations.map((item) => item.terminationId)),
    appliedImpactCount: runtime.appliedImpactIds.length,
    terminationLedgerCount: runtime.terminations.length,
  };
  scratchByRuntime.set(runtime, scratch);
  runtime.diagnostics.scratchAllocationCount += 1;
  runtime.diagnostics.impactBufferCapacity = capacity;
  runtime.diagnostics.terminationBufferCapacity = capacity;
  return scratch;
}

function refreshEventLedgers(runtime: ProjectileRuntimeStateV2, scratch: ProjectileStepperScratch): void {
  if (scratch.appliedImpactCount !== runtime.appliedImpactIds.length) {
    scratch.appliedImpactIds.clear();
    for (const id of runtime.appliedImpactIds) scratch.appliedImpactIds.add(id);
    scratch.appliedImpactCount = runtime.appliedImpactIds.length;
  }
  if (scratch.terminationLedgerCount !== runtime.terminations.length) {
    scratch.terminationIds.clear();
    for (const termination of runtime.terminations) scratch.terminationIds.add(termination.terminationId);
    scratch.terminationLedgerCount = runtime.terminations.length;
  }
}

function queueImpact(
  runtime: ProjectileRuntimeStateV2,
  scratch: ProjectileStepperScratch,
  slot: number,
  impact: ProjectileImpactV1,
): void {
  if (scratch.impactCount >= scratch.impactBuffer.length) {
    runtime.diagnostics.eventOverflowCount += 1;
    throw new Error('Projectile impact buffer overflow despite pool-bounded capacity.');
  }
  scratch.impactBuffer[scratch.impactCount++] = {
    slot,
    generation: runtime.pool.generation[slot]!,
    impact,
  };
}

function queueTermination(
  runtime: ProjectileRuntimeStateV2,
  scratch: ProjectileStepperScratch,
  slot: number,
  termination: ProjectileTerminationV1,
): void {
  if (scratch.terminationCount >= scratch.terminationBuffer.length) {
    runtime.diagnostics.eventOverflowCount += 1;
    throw new Error('Projectile termination buffer overflow despite pool-bounded capacity.');
  }
  scratch.terminationBuffer[scratch.terminationCount++] = {
    slot,
    generation: runtime.pool.generation[slot]!,
    termination,
  };
}

function applyPendingImpacts(
  runtime: ProjectileRuntimeStateV2,
  scratch: ProjectileStepperScratch,
  createdImpactIds: string[],
): void {
  for (let index = 0; index < scratch.impactCount; index += 1) {
    const pending = scratch.impactBuffer[index]!;
    const impact = pending.impact;
    if (scratch.appliedImpactIds.has(impact.impactId)) continue;
    scratch.appliedImpactIds.add(impact.impactId);
    insertSortedBounded(runtime.appliedImpactIds, impact.impactId, MAX_STAGE3_APPLIED_IMPACT_IDS, compareText);
    insertSortedBounded(runtime.impacts, impact, MAX_STAGE3_IMPACT_ENTRIES, compareImpacts);
    runtime.diagnostics.lastImpactId = impact.impactId;
    createdImpactIds.push(impact.impactId);
  }
  scratch.appliedImpactCount = runtime.appliedImpactIds.length;
}

function applyPendingTerminations(
  runtime: ProjectileRuntimeStateV2,
  scratch: ProjectileStepperScratch,
  createdTerminationIds: string[],
): void {
  for (let index = 0; index < scratch.terminationCount; index += 1) {
    const pending = scratch.terminationBuffer[index]!;
    const termination = pending.termination;
    if (!scratch.terminationIds.has(termination.terminationId)) {
      scratch.terminationIds.add(termination.terminationId);
      insertSortedBounded(runtime.terminations, termination, MAX_STAGE3_TERMINATION_ENTRIES, compareTerminations);
      runtime.diagnostics.lastTerminationId = termination.terminationId;
      createdTerminationIds.push(termination.terminationId);
    }
    if (
      runtime.pool.active[pending.slot] === 1
      && runtime.pool.generation[pending.slot] === pending.generation
      && runtime.pool.projectileIds[pending.slot] === termination.projectileId
    ) {
      releaseProjectileSlotByIndex(runtime, pending.slot);
    }
  }
  scratch.terminationLedgerCount = runtime.terminations.length;
}

function createImpactFromSlot(
  state: Pick<SimulationState, 'map'>,
  runtime: ProjectileRuntimeStateV2,
  slot: number,
  collision: BallisticRayResult,
  impactSeconds: number,
  projectileAgeSeconds: number,
  velocityX: number,
  velocityY: number,
  velocityZ: number,
  scratch: ProjectileStepperScratch,
): ProjectileImpactV1 {
  const pool = runtime.pool;
  const shotId = pool.shotIds[slot]!;
  const impactId = `${shotId}:impact:${pool.impactSequence[slot]! + 1}`;
  let objectKind: string | null = null;
  if (collision.hitObjectId) {
    for (const object of scratch.traceScratch.objectCandidates) {
      if (object.id === collision.hitObjectId) {
        objectKind = object.kind;
        break;
      }
    }
  }
  const cell = getCell(
    state.map,
    Math.floor(collision.impactGridPosition.x),
    Math.floor(collision.impactGridPosition.y),
  );
  return {
    schemaVersion: PROJECTILE_IMPACT_SCHEMA_VERSION,
    impactId,
    projectileId: pool.projectileIds[slot]!,
    shotId,
    shooterId: pool.shooterIds[slot]!,
    hitType: collision.hitType as ProjectileImpactV1['hitType'],
    impactSeconds: normalizeSmall(impactSeconds),
    projectileAgeSeconds: normalizeSmall(projectileAgeSeconds),
    point: {
      xMetres: collision.impactPoint.xMetres,
      yMetres: collision.impactPoint.yMetres,
      zMetres: collision.impactPoint.zMetres,
    },
    hitObjectId: collision.hitObjectId ?? null,
    hitUnitId: collision.hitUnitId ?? null,
    hitZone: collision.hitZone ?? null,
    materialId: collision.hitType === 'terrain'
      ? cell?.surfaceMaterialId ?? null
      : collision.hitType === 'object'
        ? `map_object:${objectKind ?? 'unknown'}`
        : null,
    normal: null,
    velocityBeforeImpact: { x: velocityX, y: velocityY, z: velocityZ },
  };
}

function createTerminationFromSlot(
  runtime: ProjectileRuntimeStateV2,
  slot: number,
  reason: ProjectileTerminationV1['reason'],
  simulationSeconds: number,
  xMetres: number,
  yMetres: number,
  zMetres: number,
): ProjectileTerminationV1 {
  const pool = runtime.pool;
  return {
    schemaVersion: PROJECTILE_TERMINATION_SCHEMA_VERSION,
    terminationId: `${pool.shotIds[slot] ?? pool.projectileIds[slot] ?? `slot-${slot}`}:termination`,
    projectileId: pool.projectileIds[slot] ?? `invalid-slot-${slot}`,
    shotId: pool.shotIds[slot] ?? `invalid-slot-${slot}`,
    reason,
    simulationSeconds: normalizeSmall(simulationSeconds),
    point: { xMetres, yMetres, zMetres },
  };
}

function setGridPoint(point: { x: number; y: number }, x: number, y: number): { x: number; y: number } {
  point.x = x;
  point.y = y;
  return point;
}

function findMapExitFraction(
  state: Pick<SimulationState, 'map'>,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number | null {
  const maximumX = state.map.width * state.map.metersPerCell;
  const maximumY = state.map.height * state.map.metersPerCell;
  let nearest = Number.POSITIVE_INFINITY;
  nearest = lowerBoundaryFraction(nearest, startX, endX, 0, maximumX);
  nearest = lowerBoundaryFraction(nearest, startY, endY, 0, maximumY);
  return nearest >= 0 && nearest <= 1 ? nearest : null;
}

function lowerBoundaryFraction(
  current: number,
  start: number,
  end: number,
  minimum: number,
  maximum: number,
): number {
  if (end < minimum && start >= minimum) current = Math.min(current, (minimum - start) / (end - start));
  if (end >= maximum && start < maximum) current = Math.min(current, (maximum - start) / (end - start));
  return current;
}

function insertSortedBounded<T>(
  target: T[],
  value: T,
  capacity: number,
  compare: (left: T, right: T) => number,
): void {
  let low = 0;
  let high = target.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compare(target[middle]!, value) <= 0) low = middle + 1;
    else high = middle;
  }
  target.splice(low, 0, value);
  if (target.length > capacity) target.splice(0, target.length - capacity);
}

function compareImpacts(left: ProjectileImpactV1, right: ProjectileImpactV1): number {
  return left.impactSeconds - right.impactSeconds || compareText(left.impactId, right.impactId);
}

function compareTerminations(left: ProjectileTerminationV1, right: ProjectileTerminationV1): number {
  return left.simulationSeconds - right.simulationSeconds || compareText(left.terminationId, right.terminationId);
}

function comparePendingImpacts(left: PendingImpact, right: PendingImpact): number {
  return left.impact.impactSeconds - right.impact.impactSeconds
    || compareText(left.impact.shotId, right.impact.shotId)
    || compareText(left.impact.impactId, right.impact.impactId);
}

function comparePendingTerminations(left: PendingTermination, right: PendingTermination): number {
  return left.termination.simulationSeconds - right.termination.simulationSeconds
    || compareText(left.termination.shotId, right.termination.shotId)
    || compareText(left.termination.terminationId, right.termination.terminationId);
}

function sortPrefix<T>(
  values: Array<T | null>,
  count: number,
  compare: (left: T, right: T) => number,
): void {
  for (let root = Math.floor(count / 2) - 1; root >= 0; root -= 1) siftDown(values, count, root, compare);
  for (let end = count - 1; end > 0; end -= 1) {
    swap(values, 0, end);
    siftDown(values, end, 0, compare);
  }
}

function siftDown<T>(
  values: Array<T | null>,
  count: number,
  root: number,
  compare: (left: T, right: T) => number,
): void {
  let current = root;
  while (true) {
    const left = current * 2 + 1;
    if (left >= count) return;
    const right = left + 1;
    let largest = left;
    if (right < count && compare(values[right]!, values[left]!) > 0) largest = right;
    if (compare(values[largest]!, values[current]!) <= 0) return;
    swap(values, current, largest);
    current = largest;
  }
}

function swap<T>(values: Array<T | null>, left: number, right: number): void {
  const value = values[left];
  values[left] = values[right];
  values[right] = value;
}

function clearEventPrefix<T>(values: Array<T | null>, count: number): void {
  for (let index = 0; index < count; index += 1) values[index] = null;
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

function increment(value: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, value + 1);
}
