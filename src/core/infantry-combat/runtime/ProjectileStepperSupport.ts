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
  type CombatUnitIndex,
  type CombatUnitSpatialQueryScratch,
} from '../../combat/CombatUnitSpatialIndex';
import { getCell } from '../../map/MapModel';
import { getMapObjectSpatialIndex } from '../../spatial/MapObjectSpatialIndex';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  createBodyContinuationState,
  MAX_BODY_PENETRATIONS_PER_PROJECTILE,
  resolveBodyPenetration,
} from './BodyPenetration';
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
  type ProjectileRuntimeStateV3,
  type ProjectileTerminationV1,
} from './ProjectileRuntimeTypes';
import {
  releaseProjectileSlotByIndex,
  syncProjectileRuntimeDiagnostics,
} from './ProjectileRuntime';
import { applyProjectileImpactWound } from './WoundImpactApplication';

const TIME_EPSILON_SECONDS = 1e-10;
const DISTANCE_EPSILON_METRES = 1e-7;
const PROJECTILE_UNIT_BROAD_PHASE_PADDING_METRES = 2;

export interface PendingImpact {
  readonly impact: ProjectileImpactV1;
}

export interface PendingTermination {
  readonly slot: number;
  readonly generation: number;
  readonly termination: ProjectileTerminationV1;
}

export interface ProjectileStepperScratch {
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
  readonly terminationQueuedBySlot: Uint8Array;
  impactCount: number;
  terminationCount: number;
  readonly ignoredUnitIds: string[];
  ignoredUnitCount: number;
  readonly appliedImpactIds: Set<string>;
  readonly terminationIds: Set<string>;
  appliedImpactLedgerCount: number;
  terminationLedgerCount: number;
}

export const scratchByRuntime = new WeakMap<ProjectileRuntimeStateV3, ProjectileStepperScratch>();
export function prepareTraceContext(state: SimulationState, scratch: ProjectileStepperScratch): void {
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

export function getScratch(runtime: ProjectileRuntimeStateV3): ProjectileStepperScratch {
  let scratch = scratchByRuntime.get(runtime);
  if (scratch) return scratch;
  const capacity = runtime.pool.capacity;
  const impactCapacity = capacity * MAX_BODY_PENETRATIONS_PER_PROJECTILE;
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
      ignoreUnitIds: [],
    },
    unitCandidates: [],
    unitQueryScratch: createCombatUnitSpatialQueryScratch(),
    unitQueryStartGrid: { x: 0, y: 0 },
    unitQueryEndGrid: { x: 0, y: 0 },
    impactBuffer: Array<PendingImpact | null>(impactCapacity).fill(null),
    terminationBuffer: Array<PendingTermination | null>(capacity).fill(null),
    terminationQueuedBySlot: new Uint8Array(capacity),
    impactCount: 0,
    terminationCount: 0,
    ignoredUnitIds: [],
    ignoredUnitCount: 0,
    appliedImpactIds: new Set(runtime.appliedImpactIds),
    terminationIds: new Set(runtime.terminations.map((item) => item.terminationId)),
    appliedImpactLedgerCount: runtime.appliedImpactIds.length,
    terminationLedgerCount: runtime.terminations.length,
  };
  scratchByRuntime.set(runtime, scratch);
  runtime.diagnostics.scratchAllocationCount += 1;
  runtime.diagnostics.impactBufferCapacity = impactCapacity;
  runtime.diagnostics.terminationBufferCapacity = capacity;
  return scratch;
}

export function refreshEventLedgers(runtime: ProjectileRuntimeStateV3, scratch: ProjectileStepperScratch): void {
  if (scratch.appliedImpactLedgerCount !== runtime.appliedImpactIds.length) {
    scratch.appliedImpactIds.clear();
    for (const id of runtime.appliedImpactIds) scratch.appliedImpactIds.add(id);
    scratch.appliedImpactLedgerCount = runtime.appliedImpactIds.length;
  }
  if (scratch.terminationLedgerCount !== runtime.terminations.length) {
    scratch.terminationIds.clear();
    for (const termination of runtime.terminations) scratch.terminationIds.add(termination.terminationId);
    scratch.terminationLedgerCount = runtime.terminations.length;
  }
}

export function queueImpact(
  runtime: ProjectileRuntimeStateV3,
  scratch: ProjectileStepperScratch,
  impact: ProjectileImpactV1,
): void {
  if (scratch.impactCount >= scratch.impactBuffer.length) {
    runtime.diagnostics.eventOverflowCount += 1;
    throw new Error('Projectile impact buffer overflow despite fixed Stage 6 capacity.');
  }
  scratch.impactBuffer[scratch.impactCount++] = { impact };
}

export function queueTermination(
  runtime: ProjectileRuntimeStateV3,
  scratch: ProjectileStepperScratch,
  slot: number,
  termination: ProjectileTerminationV1,
): void {
  if (scratch.terminationQueuedBySlot[slot] === 1) return;
  if (scratch.terminationCount >= scratch.terminationBuffer.length) {
    runtime.diagnostics.eventOverflowCount += 1;
    throw new Error('Projectile termination buffer overflow despite pool-bounded capacity.');
  }
  scratch.terminationQueuedBySlot[slot] = 1;
  scratch.terminationBuffer[scratch.terminationCount++] = {
    slot,
    generation: runtime.pool.generation[slot]!,
    termination,
  };
}

export function applyPendingImpacts(
  runtime: ProjectileRuntimeStateV3,
  unitIndex: CombatUnitIndex,
  scratch: ProjectileStepperScratch,
  createdImpactIds: string[],
): void {
  for (let index = 0; index < scratch.impactCount; index += 1) {
    const impact = scratch.impactBuffer[index]!.impact;
    if (scratch.appliedImpactIds.has(impact.impactId)) continue;
    insertSortedBounded(runtime.appliedImpactIds, impact.impactId, MAX_STAGE3_APPLIED_IMPACT_IDS, compareText);
    insertSortedBounded(runtime.impacts, impact, MAX_STAGE3_IMPACT_ENTRIES, compareImpacts);
    scratch.appliedImpactIds.add(impact.impactId);
    runtime.diagnostics.lastImpactId = impact.impactId;
    createdImpactIds.push(impact.impactId);
    const wound = applyProjectileImpactWound(impact, unitIndex);
    if (wound.result.applied) runtime.diagnostics.woundAppliedCount += 1;
    else if (wound.result.reason === 'duplicate_impact') runtime.diagnostics.woundDuplicateCount += 1;
    else if (wound.result.reason === 'target_unit_missing') runtime.diagnostics.woundTargetMissingCount += 1;
  }
  scratch.appliedImpactIds.clear();
  for (const id of runtime.appliedImpactIds) scratch.appliedImpactIds.add(id);
  scratch.appliedImpactLedgerCount = runtime.appliedImpactIds.length;
}

export function applyPendingTerminations(
  runtime: ProjectileRuntimeStateV3,
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

export function createImpactFromCollision(
  state: Pick<SimulationState, 'map'>,
  runtime: ProjectileRuntimeStateV3,
  scratch: ProjectileStepperScratch,
  slot: number,
  collision: BallisticRayResult,
  bodyPhysics: ProjectileImpactV1['bodyPhysics'],
  impactSequence: number,
  impactSeconds: number,
  projectileAgeSeconds: number,
  velocityBeforeImpact: { x: number; y: number; z: number },
): ProjectileImpactV1 {
  const pool = runtime.pool;
  let objectKind: string | null = null;
  if (collision.hitObjectId) {
    for (const object of scratch.traceScratch.objectCandidates) {
      if (object.id === collision.hitObjectId) {
        objectKind = object.kind;
        break;
      }
    }
  }
  const point = bodyPhysics?.entryPoint ?? collision.impactPoint;
  const cell = getCell(
    state.map,
    Math.floor(point.xMetres / state.map.metersPerCell),
    Math.floor(point.yMetres / state.map.metersPerCell),
  );
  return {
    schemaVersion: PROJECTILE_IMPACT_SCHEMA_VERSION,
    impactId: `${pool.shotIds[slot]}:impact:${impactSequence}`,
    impactSequence,
    projectileId: pool.projectileIds[slot]!,
    shotId: pool.shotIds[slot]!,
    shooterId: pool.shooterIds[slot]!,
    hitType: collision.hitType as ProjectileImpactV1['hitType'],
    impactSeconds: normalizeSmall(impactSeconds),
    projectileAgeSeconds: normalizeSmall(projectileAgeSeconds),
    point: { ...point },
    hitObjectId: collision.hitObjectId ?? null,
    hitUnitId: collision.hitUnitId ?? null,
    hitZone: collision.hitZone ?? null,
    materialId: collision.hitType === 'terrain'
      ? typeof cell?.surfaceMaterialId === 'string' ? cell.surfaceMaterialId : null
      : collision.hitType === 'object'
        ? `map_object:${objectKind ?? 'unknown'}`
        : null,
    normal: bodyPhysics?.entryNormal ?? null,
    velocityBeforeImpact: { ...velocityBeforeImpact },
    bodyPhysics: bodyPhysics ?? null,
  };
}

export function createTerminationFromSlot(
  runtime: ProjectileRuntimeStateV3,
  slot: number,
  reason: ProjectileTerminationV1['reason'],
  simulationSeconds: number,
  point: { xMetres: number; yMetres: number; zMetres: number },
): ProjectileTerminationV1 {
  const pool = runtime.pool;
  return {
    schemaVersion: PROJECTILE_TERMINATION_SCHEMA_VERSION,
    terminationId: `${pool.shotIds[slot] ?? pool.projectileIds[slot] ?? `slot-${slot}`}:termination`,
    projectileId: pool.projectileIds[slot] ?? `invalid-slot-${slot}`,
    shotId: pool.shotIds[slot] ?? `invalid-slot-${slot}`,
    reason,
    simulationSeconds: normalizeSmall(simulationSeconds),
    point: { ...point },
  };
}

export function recordBodyDiagnostics(
  runtime: ProjectileRuntimeStateV3,
  impactId: string,
  body: NonNullable<ProjectileImpactV1['bodyPhysics']>,
): void {
  runtime.diagnostics.bodyImpactCount += 1;
  if (body.status === 'penetrated') {
    runtime.diagnostics.bodyPenetrationCount += 1;
    runtime.diagnostics.penetratedBodyImpactCount += 1;
  }
  else if (body.status === 'penetration_limit') runtime.diagnostics.penetrationLimitCount += 1;
  else runtime.diagnostics.bodyStopCount += 1;
  runtime.diagnostics.lastBodyImpactId = impactId;
  runtime.diagnostics.lastBodyBudgetBefore = body.penetrationBudgetBefore;
  runtime.diagnostics.lastBodyBudgetAfter = body.penetrationBudgetAfter;
  runtime.diagnostics.lastBodyResistance = body.penetrationResistance;
  runtime.diagnostics.lastBodySpeedBefore = body.speedBeforeMetresPerSecond;
  runtime.diagnostics.lastBodySpeedAfter = body.speedAfterMetresPerSecond;
}

export function addIgnoredUnitId(scratch: ProjectileStepperScratch, unitId: string): void {
  for (let index = 0; index < scratch.ignoredUnitCount; index += 1) {
    if (scratch.ignoredUnitIds[index] === unitId) return;
  }
  if (scratch.ignoredUnitCount < MAX_BODY_PENETRATIONS_PER_PROJECTILE) {
    scratch.ignoredUnitIds[scratch.ignoredUnitCount++] = unitId;
  }
}

export function ignoredPrefix(scratch: ProjectileStepperScratch): readonly string[] {
  return scratch.ignoredUnitIds;
}

export function pointAtSlot(runtime: ProjectileRuntimeStateV3, slot: number) {
  return {
    xMetres: runtime.pool.positionX[slot]!,
    yMetres: runtime.pool.positionY[slot]!,
    zMetres: runtime.pool.positionZ[slot]!,
  };
}

export function velocityAtSlot(runtime: ProjectileRuntimeStateV3, slot: number) {
  return {
    x: runtime.pool.velocityX[slot]!,
    y: runtime.pool.velocityY[slot]!,
    z: runtime.pool.velocityZ[slot]!,
  };
}

export function writeKinematics(
  runtime: ProjectileRuntimeStateV3,
  slot: number,
  point: { xMetres: number; yMetres: number; zMetres: number },
  velocity: { x: number; y: number; z: number },
  ageSeconds: number,
): void {
  runtime.pool.positionX[slot] = point.xMetres;
  runtime.pool.positionY[slot] = point.yMetres;
  runtime.pool.positionZ[slot] = point.zMetres;
  runtime.pool.velocityX[slot] = velocity.x;
  runtime.pool.velocityY[slot] = velocity.y;
  runtime.pool.velocityZ[slot] = velocity.z;
  runtime.pool.ageSeconds[slot] = normalizeSmall(ageSeconds);
}

export function setGridPoint(point: { x: number; y: number }, x: number, y: number): { x: number; y: number } {
  point.x = x;
  point.y = y;
  return point;
}

export function findMapExitFraction(
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

export function lowerBoundaryFraction(
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

export function insertSortedBounded<T>(
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

export function compareImpacts(left: ProjectileImpactV1, right: ProjectileImpactV1): number {
  return left.impactSeconds - right.impactSeconds
    || compareText(left.shotId, right.shotId)
    || (left.impactSequence ?? 0) - (right.impactSequence ?? 0)
    || compareText(left.impactId, right.impactId);
}

export function compareTerminations(left: ProjectileTerminationV1, right: ProjectileTerminationV1): number {
  return left.simulationSeconds - right.simulationSeconds
    || compareText(left.shotId, right.shotId)
    || compareText(left.terminationId, right.terminationId);
}

export function comparePendingImpacts(left: PendingImpact, right: PendingImpact): number {
  return compareImpacts(left.impact, right.impact);
}

export function comparePendingTerminations(left: PendingTermination, right: PendingTermination): number {
  return compareTerminations(left.termination, right.termination);
}

export function sortPrefix<T>(
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

export function siftDown<T>(
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

export function swap<T>(values: Array<T | null>, left: number, right: number): void {
  const value = values[left];
  values[left] = values[right];
  values[right] = value;
}

export function clearEventPrefix<T>(values: Array<T | null>, count: number): void {
  for (let index = 0; index < count; index += 1) values[index] = null;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function normalizeSmall(value: number): number {
  if (Math.abs(value) < TIME_EPSILON_SECONDS) return 0;
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

export function increment(value: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, value + 1);
}

export function incrementUint32(value: number): number {
  return value >= 0xffff_ffff ? 1 : value + 1;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
