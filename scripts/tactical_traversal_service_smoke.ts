import type { PreparedAwarenessWorldSnapshot } from '../src/runtime/AwarenessWorldRuntime';
import { createMovementProfileRegistry } from '../src/core/movement/MovementProfiles';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import { createDefaultTacticalPositionSettings } from '../src/core/tactical/TacticalPositionSettings';
import type { UnitModel } from '../src/core/units/UnitModel';
import {
  TacticalTraversalPlanningService,
  type TacticalTraversalPlanningFieldRuntime,
} from '../src/core/navigation/TacticalTraversalPlanningService';
import { planTacticalTraversal } from '../src/core/navigation/TacticalTraversalPlanner';
import { createDefaultTacticalTraversalProfile } from '../src/core/navigation/TacticalTraversalProfile';

function equal(left: unknown, right: unknown, label: string): void {
  if (left !== right) throw new Error(`${label}: expected ${String(right)}, got ${String(left)}`);
}

function ok(value: unknown, label: string): void {
  if (!value) throw new Error(label);
}

function createField(identity = 'field-1', worldKey = 'world-1'): PreparedAwarenessWorldSnapshot {
  const length = 8;
  return {
    unitId: 'unit-1',
    worldKey,
    canonicalThreatKey: 'threats-none',
    mapKey: 'map-1',
    fieldIdentity: identity,
    rasterDigest: identity,
    jobId: 1,
    field: {
      width: length,
      height: 1,
      metersPerCell: 2,
      passable: new Uint8Array(length).fill(1),
      movementCost: new Float32Array(length).fill(1),
      danger: new Uint8Array(length),
      suppression: new Uint8Array(length),
      concealment: new Uint8Array(length),
      safety: new Uint8Array(length).fill(75),
      uncertainty: new Uint8Array(length),
      expectedProtection: new Uint8Array(length),
      expectedProtectionAgainstThreat: new Uint8Array(length),
      reverseSlopeQuality: new Uint8Array(length),
      forwardSlopeRisk: new Uint8Array(length),
      staticProtectionStanding: new Uint8Array(length),
      staticProtectionCrouched: new Uint8Array(length),
      staticProtectionProne: new Uint8Array(length),
      protectedThreatIndex: new Int16Array(length).fill(-1),
      dangerPixels: new Uint32Array(length),
      stealthPixels: new Uint32Array(length),
      threatIds: [],
      threatConfidence: 0,
    },
  };
}

function createUnit(): UnitModel {
  return {
    id: 'unit-1',
    position: { x: 0.5, y: 0.5 },
    order: createMoveOrder({ x: 7.5, y: 0.5 }, {
      source: 'ai',
      ownerToken: 'owner-1',
      routeCells: Array.from({ length: 8 }, (_, x) => ({ x, y: 0 })),
      routeRevision: 1,
      movementProfileId: 'normal_walk',
      movementProfileSelectionRevision: 1,
    }),
    playerCommand: null,
    tacticalKnowledge: { revision: 1, threats: [] },
    tacticalPositionSettings: createDefaultTacticalPositionSettings(),
    tacticalPositionSettingsRevision: 1,
    tacticalTraversalProfile: createDefaultTacticalTraversalProfile(),
    tacticalTraversalProfileRevision: 1,
    behaviorRuntime: {
      posture: 'standing',
      lastEvent: '',
      reason: '',
    },
  } as unknown as UnitModel;
}

class FieldRuntime implements TacticalTraversalPlanningFieldRuntime {
  private readonly listeners = new Set<() => void>();
  current: PreparedAwarenessWorldSnapshot | null = createField();

  requestWorldField(): PreparedAwarenessWorldSnapshot | null {
    return this.current;
  }

  readReadyWorldField(): PreparedAwarenessWorldSnapshot | null {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(): void {
    for (const listener of this.listeners) listener();
  }
}

function createState(unit: UnitModel): SimulationState {
  return {
    units: [unit],
    simulationStep: 10,
    movementProfiles: createMovementProfileRegistry(),
  } as unknown as SimulationState;
}

function flush(scheduled: Array<() => void>): void {
  while (scheduled.length > 0) scheduled.shift()!();
}

{
  const unit = createUnit();
  const state = createState(unit);
  const fieldRuntime = new FieldRuntime();
  const scheduled: Array<() => void> = [];
  const service = new TacticalTraversalPlanningService(state, fieldRuntime, {
    schedule: (callback) => scheduled.push(callback),
  });

  const first = service.ensureForUnit(unit);
  equal(first?.status, 'queued', 'new route must queue one request');
  equal(unit.order?.traversalPlanStatus, 'pending', 'new route must remain on fallback while pending');
  flush(scheduled);
  equal(unit.order?.traversalPlanStatus, 'ready', 'prepared field should produce ready plan');
  ok(unit.order?.traversalPlan, 'ready order must contain a plan');
  const planningCount = service.getDiagnostics().planningCount;

  const reused = service.ensureForUnit(unit);
  equal(reused?.status, 'ready', 'same exact identity must reuse ready request');
  equal(service.getDiagnostics().planningCount, planningCount, 'same identity must not replan every step');

  const fieldRequestId = reused!.requestId;
  fieldRuntime.current = createField('field-2', 'world-2');
  fieldRuntime.publish();
  equal(service.readRequest(fieldRequestId)?.status, 'stale', 'new shared field identity must stale ready request');
  equal(unit.order?.traversalPlanStatus, 'stale', 'new shared field must stale attached plan');
  flush(scheduled);
  equal(unit.order?.traversalPlanStatus, 'ready', 'new shared field should produce replacement plan');
  equal(unit.order?.traversalPlan?.fieldIdentity, 'field-2', 'replacement plan must own new field identity');

  const routeRequest = service.readLatestForUnit(unit.id)!;
  unit.order!.routeRevision = 2;
  unit.order!.routeCells = unit.order!.routeCells!.slice(0, 6);
  service.ensureForUnit(unit);
  equal(service.readRequest(routeRequest.requestId)?.status, 'stale', 'route revision must stale old request');
  equal(unit.order?.traversalPlanStatus, 'stale', 'old ready plan must become stale after route change');
  flush(scheduled);
  equal(unit.order?.traversalPlanStatus, 'ready', 'changed route should receive a new plan');
  equal(unit.order?.traversalPlan?.routeRevision, 2, 'new plan must belong to new route revision');
  service.destroy();
}

{
  const unit = createUnit();
  const state = createState(unit);
  const fieldRuntime = new FieldRuntime();
  const scheduled: Array<() => void> = [];
  let mutated = false;
  const service = new TacticalTraversalPlanningService(state, fieldRuntime, {
    schedule: (callback) => scheduled.push(callback),
    planPrepared: (input) => {
      const result = planTacticalTraversal(input);
      if (!mutated) {
        mutated = true;
        unit.order!.routeRevision = 9;
      }
      return result;
    },
  });
  const request = service.ensureForUnit(unit)!;
  flush(scheduled);
  equal(service.readRequest(request.requestId)?.status, 'stale', 'result changed during planning must be discarded');
  ok(!unit.order?.traversalPlan, 'stale asynchronous-equivalent result must not attach to changed order');
  service.destroy();
}

console.log('tactical traversal service smoke: ok');
