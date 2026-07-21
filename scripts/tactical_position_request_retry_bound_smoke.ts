import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import { installTacticalPositionSearchResilience } from '../src/core/tactical/TacticalPositionSearchResilience';
import {
  TacticalPositionSearchService,
  type TacticalPositionFieldRuntime,
} from '../src/core/tactical/TacticalPositionSearchService';
import { getStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';
import { normalizeUnits } from '../src/core/units/UnitModel';
import type { PreparedAwarenessWorldSnapshot } from '../src/runtime/AwarenessWorldRuntime';

class ReadyFieldRuntime implements TacticalPositionFieldRuntime {
  private readonly listeners = new Set<() => void>();
  readonly ready: PreparedAwarenessWorldSnapshot = {
    unitId: 'alpha',
    worldKey: 'world:unstable',
    canonicalThreatKey: 'canonical:unstable',
    mapKey: 'map:unstable',
    fieldIdentity: 'field:unstable',
    rasterDigest: 'digest:unstable',
    jobId: 1,
    field: {} as PreparedAwarenessWorldSnapshot['field'],
  };

  requestWorldField(): PreparedAwarenessWorldSnapshot { return this.ready; }
  readReadyWorldField(): PreparedAwarenessWorldSnapshot { return this.ready; }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  destroy(): void { this.listeners.clear(); }
}

const microtasks: Array<() => void> = [];
const previousQueueMicrotask = globalThis.queueMicrotask;
globalThis.queueMicrotask = (callback): void => microtasks.push(callback);

const unit = normalizeUnits([{ id: 'alpha', type: 'infantry_squad', side: 'blue', x: 1, y: 1 }])[0]!;
unit.tacticalKnowledge.threats.push({
  id: 'unit:enemy', labelRu: 'Противник', mode: 'directional_fire',
  x: 8.5, y: 8.5, radiusCells: 0, widthCells: 0, heightCells: 0,
  rotationDegrees: 0, strength: 70, suppression: 0, stressPerSecond: 0,
  directionDegrees: 225, arcDegrees: 90, rangeCells: 30, minRangeCells: 0,
  falloffPercent: 50, confidence: 100, uncertaintyCells: 0,
  source: 'seen', visibleNow: true, lastSeenSeconds: 0, lastUpdatedSeconds: 0,
  fireThreatClass: 'rifle_fire',
});
unit.tacticalKnowledge.revision = 1;

const state = {
  units: [unit], simulationStep: 10, simulationTimeSeconds: 1,
  map: normalizeMap({
    width: 12, height: 12, cellSize: 4, metersPerCell: 2,
    defaultTerrain: 'field', defaultHeight: 0,
  }),
} as unknown as SimulationState;
const staticService = getStaticTacticalPositionService(state);
const basis = { identityKey: 'retry-bound-basis' } as NonNullable<ReturnType<typeof staticService.request>>;
staticService.request = () => basis;
staticService.readReady = () => basis;

const scheduled: Array<() => void> = [];
let searches = 0;
const service = new TacticalPositionSearchService(state, new ReadyFieldRuntime(), {
  schedule: (callback) => scheduled.push(callback),
  searchPrepared: () => {
    searches += 1;
    unit.tacticalKnowledge.revision += 1;
    return {
      candidates: [],
      diagnostics: {
        sampledCells: 0, routeExpandedCells: 0, provisionalCandidates: 0,
        sampleBudgetExhausted: false, routeBudgetExhausted: false,
      },
    };
  },
});
const destroyResilience = installTacticalPositionSearchResilience(state, service);

service.enqueueTacticalSearch(unit, 'firing', {
  queryKey: 'ui:firing',
  target: {
    mode: 'known_target', point: { x: 8.5, y: 8.5 },
    minimumRangeMeters: 0, effectiveRangeMeters: 100, maximumRangeMeters: 250,
  },
});

for (let turn = 0; turn < 12; turn += 1) {
  runScheduled(scheduled);
  microtasks.shift()?.();
}
runScheduled(scheduled);

assert.ok(searches <= 4, `one initial search plus at most three automatic retries are allowed, got ${searches}`);
assert.equal(microtasks.length, 0, 'an unstable request must stop scheduling retry microtasks');
assert.equal(service.readLatestForUnit(unit.id)?.status, 'stale');

destroyResilience();
service.destroy();
globalThis.queueMicrotask = previousQueueMicrotask;
console.log(`tactical position request retry bound smoke: searches=${searches}`);

function runScheduled(queue: Array<() => void>): void {
  while (queue.length > 0) queue.shift()!();
}
