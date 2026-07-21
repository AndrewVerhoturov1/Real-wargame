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

const unit = normalizeUnits([
  { id: 'alpha', type: 'infantry_squad', side: 'blue', x: 1, y: 1 },
])[0]!;
unit.tacticalKnowledge.threats.push({
  id: 'unit:enemy',
  labelRu: 'Противник',
  mode: 'directional_fire',
  x: 8.5,
  y: 8.5,
  radiusCells: 0,
  widthCells: 0,
  heightCells: 0,
  rotationDegrees: 0,
  strength: 70,
  suppression: 0,
  stressPerSecond: 0,
  directionDegrees: 225,
  arcDegrees: 90,
  rangeCells: 30,
  minRangeCells: 0,
  falloffPercent: 50,
  confidence: 100,
  uncertaintyCells: 0,
  source: 'seen',
  visibleNow: true,
  lastSeenSeconds: 0,
  lastUpdatedSeconds: 0,
  fireThreatClass: 'rifle_fire',
});
unit.tacticalKnowledge.revision = 1;

const state = {
  units: [unit],
  simulationStep: 10,
  simulationTimeSeconds: 1,
  map: normalizeMap({
    width: 12,
    height: 12,
    cellSize: 4,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
  }),
} as unknown as SimulationState;

const staticService = getStaticTacticalPositionService(state);
const basis = { identityKey: 'request-refresh-basis' } as NonNullable<ReturnType<typeof staticService.request>>;
staticService.request = () => basis;
staticService.readReady = () => basis;

const scheduled: Array<() => void> = [];
const runtime = new FakeFieldRuntime();
let searches = 0;
const service = new TacticalPositionSearchService(state, runtime, {
  schedule: (callback) => scheduled.push(callback),
  searchPrepared: () => {
    searches += 1;
    return {
      candidates: [],
      diagnostics: {
        sampledCells: 0,
        routeExpandedCells: 0,
        provisionalCandidates: 0,
        sampleBudgetExhausted: false,
        routeBudgetExhausted: false,
      },
    };
  },
});

const request = service.enqueueTacticalSearch(unit, 'firing', {
  queryKey: 'ui:firing',
  target: {
    mode: 'known_target',
    point: { x: 8.5, y: 8.5 },
    minimumRangeMeters: 0,
    effectiveRangeMeters: 100,
    maximumRangeMeters: 250,
  },
});
runScheduled(scheduled);
assert.equal(service.readRequest(request.requestId)?.status, 'calculating');

// The broad tactical-knowledge revision may change for metadata that does not
// alter the tactical snapshot used by this request. This must not force the
// player to click in a narrow timing window.
unit.tacticalKnowledge.revision += 1;
runtime.ready = prepared('alpha', 'field-current');
runtime.emit();
runScheduled(scheduled);

assert.equal(searches, 1, 'the request must continue once the prepared field is available');
assert.equal(
  service.readRequest(request.requestId)?.status,
  'ready',
  'a revision-only refresh must not terminate the request as stale',
);

service.destroy();
console.log('tactical position request refresh smoke: ok');

function runScheduled(queue: Array<() => void>): void {
  while (queue.length > 0) queue.shift()!();
}

class FakeFieldRuntime implements TacticalPositionFieldRuntime {
  private readonly listeners = new Set<() => void>();
  ready: PreparedAwarenessWorldSnapshot | null = null;

  requestWorldField(): PreparedAwarenessWorldSnapshot | null {
    return this.ready;
  }

  readReadyWorldField(): PreparedAwarenessWorldSnapshot | null {
    return this.ready;
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
    this.ready = null;
  }
}

function prepared(unitId: string, fieldIdentity: string): PreparedAwarenessWorldSnapshot {
  return {
    unitId,
    worldKey: `world:${fieldIdentity}`,
    canonicalThreatKey: 'canonical:stable',
    mapKey: 'map:stable',
    fieldIdentity,
    rasterDigest: `digest:${fieldIdentity}`,
    jobId: 1,
    field: {} as PreparedAwarenessWorldSnapshot['field'],
  };
}
