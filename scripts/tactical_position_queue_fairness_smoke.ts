import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  TacticalPositionSearchService,
  type TacticalPositionFieldRuntime,
} from '../src/core/tactical/TacticalPositionSearchService';
import { getStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';
import { normalizeUnits } from '../src/core/units/UnitModel';
import type { PreparedAwarenessWorldSnapshot } from '../src/runtime/AwarenessWorldRuntime';

const units = normalizeUnits([
  { id: 'waiting-owner', type: 'infantry_squad', side: 'blue', x: 1, y: 1 },
  { id: 'ready-owner', type: 'infantry_squad', side: 'blue', x: 3, y: 3 },
]);
const state = {
  units,
  simulationStep: 1,
  simulationTimeSeconds: 0,
  map: normalizeMap({ width: 8, height: 8, cellSize: 4, metersPerCell: 2, defaultTerrain: 'field' }),
} as unknown as SimulationState;
const staticService = getStaticTacticalPositionService(state);
const basis = { identityKey: 'queue-fairness-basis' } as NonNullable<ReturnType<typeof staticService.request>>;
staticService.request = () => basis;
staticService.readReady = () => basis;
const scheduled: Array<() => void> = [];
const runtime = new FieldRuntime();
runtime.readyByUnit.set('ready-owner', prepared('ready-owner', 'ready-field'));
let searchCalls = 0;
const service = new TacticalPositionSearchService(state, runtime, {
  schedule: (callback) => scheduled.push(callback),
  searchPrepared: (_field, request) => {
    searchCalls += 1;
    return {
      candidates: [{
        id: `${request.ownerUnitId}:candidate`,
        position: { x: 4.5, y: 4.5 },
        source: { kind: 'terrain', id: 'test', label: 'Test', labelRu: 'Тест' },
        metrics: {
          onMap: true, routeExists: true, distanceMeters: 2, blocksThreat: true,
          protection: 60, concealment: 30, routeDanger: 10, slopeType: 'flat', orderAlignment: 50,
        },
      }],
      diagnostics: {
        sampledCells: 1, routeExpandedCells: 1, provisionalCandidates: 1,
        sampleBudgetExhausted: false, routeBudgetExhausted: false,
      },
    };
  },
});

const waiting = service.enqueueTacticalSearch(units[0]!, 'defense', { queryKey: 'fairness' });
const ready = service.enqueueTacticalSearch(units[1]!, 'defense', { queryKey: 'fairness' });
runScheduled();
assert.equal(service.readRequest(waiting.requestId)?.status, 'calculating');
assert.equal(service.readRequest(ready.requestId)?.status, 'ready', 'a waiting owner must not block a ready owner');
assert.equal(searchCalls, 1);
assert.equal(scheduled.length, 0, 'all-waiting remainder must not create a microtask loop');

runtime.readyByUnit.set('waiting-owner', prepared('waiting-owner', 'waiting-field'));
runtime.emit();
runScheduled();
assert.equal(service.readRequest(waiting.requestId)?.status, 'ready', 'readiness event must resume the waiting request');
assert.equal(searchCalls, 2);

runtime.readyByUnit.delete('waiting-owner');
const cancelled = service.enqueueTacticalSearch(
  units[0]!,
  'defense',
  { queryKey: 'cancelled' },
  { forceRefresh: true },
);
runScheduled();
assert.equal(service.readRequest(cancelled.requestId)?.status, 'calculating');
assert.equal(service.cancel(cancelled.requestId), true);
runtime.readyByUnit.set('waiting-owner', prepared('waiting-owner', 'cancelled-field'));
runtime.emit();
runScheduled();
assert.equal(service.readRequest(cancelled.requestId)?.status, 'cancelled');
assert.equal(searchCalls, 2, 'cancelled waiting request must never execute');

service.destroy();
console.log('tactical position queue fairness smoke: ok');

function runScheduled(): void {
  let safety = 100;
  while (scheduled.length > 0 && safety > 0) {
    safety -= 1;
    scheduled.shift()!();
  }
  assert.ok(safety > 0, 'scheduled work must remain bounded');
}

class FieldRuntime implements TacticalPositionFieldRuntime {
  readonly readyByUnit = new Map<string, PreparedAwarenessWorldSnapshot>();
  private readonly listeners = new Set<() => void>();

  requestWorldField(_state: SimulationState, unit: ReturnType<typeof normalizeUnits>[number]) {
    return this.readyByUnit.get(unit.id) ?? null;
  }

  readReadyWorldField(unitId: string) {
    return this.readyByUnit.get(unitId) ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void {
    for (const listener of this.listeners) listener();
  }

  destroy(): void {
    this.listeners.clear();
    this.readyByUnit.clear();
  }
}

function prepared(unitId: string, fieldIdentity: string): PreparedAwarenessWorldSnapshot {
  return {
    unitId,
    worldKey: `world:${fieldIdentity}`,
    canonicalThreatKey: `threat:${fieldIdentity}`,
    mapKey: 'map:1',
    fieldIdentity,
    rasterDigest: `digest:${fieldIdentity}`,
    jobId: 1,
    field: {} as PreparedAwarenessWorldSnapshot['field'],
  };
}
