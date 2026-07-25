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
import {
  SUPPRESSION_EVENT_BUFFER_MULTIPLIER,
  type SuppressionEventV1,
} from './SuppressionTypes';
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

export interface SuppressionEventBufferScratchV1 {
  readonly events: Array<SuppressionEventV1 | null>;
  count: number;
  readonly queuedEventIds: Set<string>;
  readonly unitCandidates: UnitModel[];
  readonly unitQueryScratch: CombatUnitSpatialQueryScratch;
  readonly pointGrid: { x: number; y: number };
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
  readonly suppression: SuppressionEventBufferScratchV1;
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
  const suppressionEventCapacity = capacity * SUPPRESSION_EVENT_BUFFER_MULTIPLIER;
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
    suppression: {
      events: Array<SuppressionEventV1 | null>(suppressionEventCapacity).fill(null),
      count: 0,
      queuedEventIds: new Set<string>(),
      unitCandidates: [],
      unitQueryScratch: createCombatUnitSpatialQueryScratch(),
      pointGrid: { x: 0, y: 0 },
    },
  };
  scratchByRuntime.set(runtime, scratch);
  runtime.diagnostics.scratchAllocationCount += 1;
  runtime.diagnostics.impactBufferCapacity = impactCapacity;
  runtime.diagnostics.terminationBufferCapacity = capacity;
  runtime.diagnostics.suppressionEventBufferCapacity = suppressionEventCapacity;
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
