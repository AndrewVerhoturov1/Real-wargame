import {
  createCombatUnitSpatialQueryScratch,
  type CombatUnitIndex,
  type CombatUnitSpatialQueryScratch,
} from '../../combat/CombatUnitSpatialIndex';
import type { UnitModel } from '../../units/UnitModel';
import { addSuppressionEvent } from './SuppressionRuntime';
import {
  SUPPRESSION_EVENT_BUFFER_MULTIPLIER,
  type SuppressionEventV1,
} from './SuppressionTypes';
import { clearEventPrefix, sortPrefix } from './ProjectileStepperSupport';
import type { ProjectileRuntimeStateV3 } from './ProjectileRuntimeTypes';

export interface SuppressionEventBufferScratchV1 {
  readonly events: Array<SuppressionEventV1 | null>;
  count: number;
  readonly queuedEventIds: Set<string>;
  readonly unitCandidates: UnitModel[];
  readonly unitQueryScratch: CombatUnitSpatialQueryScratch;
  readonly pointGrid: { x: number; y: number };
}

const scratchByRuntime = new WeakMap<ProjectileRuntimeStateV3, SuppressionEventBufferScratchV1>();

export function getSuppressionEventBufferScratch(
  runtime: ProjectileRuntimeStateV3,
): SuppressionEventBufferScratchV1 {
  let scratch = scratchByRuntime.get(runtime);
  if (scratch) return scratch;
  const capacity = runtime.pool.capacity * SUPPRESSION_EVENT_BUFFER_MULTIPLIER;
  scratch = {
    events: Array<SuppressionEventV1 | null>(capacity).fill(null),
    count: 0,
    queuedEventIds: new Set<string>(),
    unitCandidates: [],
    unitQueryScratch: createCombatUnitSpatialQueryScratch(),
    pointGrid: { x: 0, y: 0 },
  };
  scratchByRuntime.set(runtime, scratch);
  runtime.diagnostics.suppressionEventBufferCapacity = capacity;
  runtime.diagnostics.scratchAllocationCount += 1;
  return scratch;
}

export function beginSuppressionEventSubstep(runtime: ProjectileRuntimeStateV3): void {
  const scratch = getSuppressionEventBufferScratch(runtime);
  clearEventPrefix(scratch.events, scratch.count);
  scratch.count = 0;
  scratch.queuedEventIds.clear();
}

export function queueSuppressionEvent(
  runtime: ProjectileRuntimeStateV3,
  event: SuppressionEventV1,
  affectedUnit: UnitModel,
): boolean {
  const scratch = getSuppressionEventBufferScratch(runtime);
  if (
    affectedUnit.infantryCombatRuntime.suppression.appliedEventIds.includes(event.eventId)
    || scratch.queuedEventIds.has(event.eventId)
  ) {
    runtime.diagnostics.suppressionDuplicateEventCount += 1;
    return false;
  }
  if (scratch.count >= scratch.events.length) {
    runtime.diagnostics.suppressionEventOverflowCount += 1;
    throw new Error('Suppression event buffer overflow despite projectile-capacity bound.');
  }
  scratch.events[scratch.count++] = event;
  scratch.queuedEventIds.add(event.eventId);
  runtime.diagnostics.suppressionEventBufferHighWaterMark = Math.max(
    runtime.diagnostics.suppressionEventBufferHighWaterMark,
    scratch.count,
  );
  return true;
}

export function applyQueuedSuppressionEvents(
  runtime: ProjectileRuntimeStateV3,
  unitIndex: CombatUnitIndex,
): void {
  const scratch = getSuppressionEventBufferScratch(runtime);
  sortPrefix(scratch.events, scratch.count, compareSuppressionEvents);
  for (let index = 0; index < scratch.count; index += 1) {
    const event = scratch.events[index]!;
    const affected = unitIndex.unitsById.get(event.affectedUnitId);
    if (!affected) continue;
    if (!addSuppressionEvent(affected.infantryCombatRuntime.suppression, event)) {
      runtime.diagnostics.suppressionDuplicateEventCount += 1;
      continue;
    }
    if (event.kind === 'near_miss') runtime.diagnostics.emittedNearMissCount += 1;
    else if (event.kind === 'near_impact') runtime.diagnostics.emittedNearImpactCount += 1;
    else runtime.diagnostics.emittedDirectHitCount += 1;
  }
  clearEventPrefix(scratch.events, scratch.count);
  scratch.count = 0;
  scratch.queuedEventIds.clear();
}

export function compareSuppressionEvents(left: SuppressionEventV1, right: SuppressionEventV1): number {
  return left.eventSeconds - right.eventSeconds
    || compareText(left.affectedUnitId, right.affectedUnitId)
    || compareText(left.sourceUnitId, right.sourceUnitId)
    || compareText(left.shotId, right.shotId)
    || compareText(left.eventId, right.eventId);
}
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
