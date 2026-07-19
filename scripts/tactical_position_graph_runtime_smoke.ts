import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { withAiSimulationExecutionContext, getAiSimulationExecutionContextDepth } from '../src/core/ai/AiSimulationExecutionContext';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  installTacticalPositionSearchService,
  TacticalPositionSearchService,
  type TacticalPositionFieldRuntime,
} from '../src/core/tactical/TacticalPositionSearchService';
import { normalizeUnits } from '../src/core/units/UnitModel';
import type { PreparedAwarenessWorldSnapshot } from '../src/runtime/AwarenessWorldRuntime';

const unit = normalizeUnits([{ id: 'field-driven-unit', type: 'infantry_squad', side: 'blue', x: 1, y: 4 }])[0]!;
unit.tacticalKnowledge.threats.push({
  id: 'known-threat', labelRu: 'Угроза', mode: 'circle', x: 12, y: 4,
  radiusCells: 2, widthCells: 2, heightCells: 2, rotationDegrees: 0,
  strength: 70, suppression: 20, stressPerSecond: 1, directionDegrees: 0,
  arcDegrees: 360, rangeCells: 30, minRangeCells: 0, falloffPercent: 0,
  confidence: 100, uncertaintyCells: 0, source: 'seen', visibleNow: true,
  lastSeenSeconds: 0, lastUpdatedSeconds: 0,
});
unit.tacticalKnowledge.revision = 1;
const state = {
  units: [unit],
  simulationStep: 10,
  simulationTimeSeconds: 1,
  map: { metersPerCell: 2 },
} as unknown as SimulationState;
const scheduled: Array<() => void> = [];
const fieldRuntime = new GraphFieldRuntime();
let localSearchCalls = 0;
const service = new TacticalPositionSearchService(state, fieldRuntime, {
  schedule: (callback) => scheduled.push(callback),
  searchPrepared: () => {
    localSearchCalls += 1;
    return {
      candidates: [{
        id: 'tactical:8:4:prone',
        position: { x: 8.5, y: 4.5 },
        source: {
          kind: 'terrain',
          id: 'field:8:4',
          label: 'Threat-protected position',
          labelRu: 'Позиция, защищённая от угрозы',
        },
        metrics: {
          onMap: true,
          routeExists: true,
          distanceMeters: 14,
          blocksThreat: true,
          protection: 86,
          concealment: 42,
          routeDanger: 18,
          slopeType: 'reverse',
          orderAlignment: 60,
          danger: 14,
          suppression: 8,
          safety: 86,
          safetyGain: 40,
          uncertainty: 2,
          recommendedPosture: 'prone',
          routeCost: 18,
        },
      }],
      diagnostics: {
        sampledCells: 120,
        routeExpandedCells: 90,
        provisionalCandidates: 1,
        sampleBudgetExhausted: false,
        routeBudgetExhausted: false,
      },
    };
  },
});
installTacticalPositionSearchService(state, service);

const first = runWithContext({ self_position: { x: 1.5, y: 4.5 } }, 1000);
const requestId = first.blackboard.cover_query_request_id;
assert.equal(typeof requestId, 'string');
assert.equal(first.tacticalQueries.cover_query?.searchRequestId, requestId);
assert.equal(first.tacticalQueries.cover_query?.searchRequestStatus, 'queued');
assert.equal(service.getDiagnostics().requestCount, 1);
assert.equal(localSearchCalls, 0);
runScheduled();
assert.equal(service.readRequest(String(requestId))?.status, 'calculating');

const second = runWithContext(first.blackboard, 1600);
assert.equal(second.blackboard.cover_query_request_id, requestId);
assert.equal(second.tacticalQueries.cover_query?.searchRequestStatus, 'calculating');
assert.equal(service.getDiagnostics().requestCount, 1, 'ordinary graph polling must not create another request');
assert.equal(localSearchCalls, 0);

fieldRuntime.ready = prepared(unit.id, 'field-ready-1');
fieldRuntime.emit();
runScheduled();
assert.equal(localSearchCalls, 1);
assert.equal(service.readRequest(String(requestId))?.status, 'ready');

const third = runWithContext(second.blackboard, 2200);
assert.equal(third.ok, true, JSON.stringify({
  status: third.status,
  explanation: third.explanation,
  explanationRu: third.explanationRu,
  blackboard: third.blackboard,
  tacticalQuery: third.tacticalQueries.cover_query,
  trace: third.trace,
  serviceRequest: service.readRequest(String(requestId)),
}, null, 2));
assert.equal(third.status, 'success');
assert.equal(third.blackboard.cover_query_request_id, requestId);
assert.deepEqual(third.blackboard.best_cover_position, { x: 8.5, y: 4.5 });
assert.equal(third.blackboard.best_cover_position_posture, 'prone');
assert.equal(third.tacticalQueries.cover_query?.winnerCandidateId, 'tactical:8:4:prone');
assert.equal(third.tacticalQueries.cover_query?.searchRequestStatus, 'ready');
assert.equal(localSearchCalls, 1, 'ready polling must reuse the same immutable result');
assert.equal(getAiSimulationExecutionContextDepth(), 0, 'execution context must always unwind');

service.destroy();
assert.equal(fieldRuntime.destroyed, true);
assert.equal(fieldRuntime.listenerCount, 0);

console.log('Tactical position Graph v2 smoke passed: one exact simulation request is persisted, polled statefully and reused by Filter/Score/Select.');

function runWithContext(blackboard: Record<string, unknown>, nowMs: number) {
  return withAiSimulationExecutionContext(state, unit, () => runAiGraphRuntime({
    graph: tacticalPositionGraph(),
    unitId: unit.id,
    blackboard,
    nowMs,
  }));
}

function runScheduled(): void {
  while (scheduled.length > 0) scheduled.shift()!();
}

class GraphFieldRuntime implements TacticalPositionFieldRuntime {
  ready: PreparedAwarenessWorldSnapshot | null = null;
  private readonly listeners = new Set<() => void>();
  requestCalls = 0;
  destroyed = false;

  get listenerCount(): number { return this.listeners.size; }

  requestWorldField(): PreparedAwarenessWorldSnapshot | null {
    this.requestCalls += 1;
    return this.ready;
  }

  readReadyWorldField(): PreparedAwarenessWorldSnapshot | null {
    return this.ready;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void { for (const listener of this.listeners) listener(); }
  destroy(): void { this.destroyed = true; this.listeners.clear(); this.ready = null; }
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

function tacticalPositionGraph(): AiGraph {
  return {
    version: 2,
    id: 'field-driven-tactical-position-graph',
    name: 'Field-driven tactical position graph',
    nameRu: 'Граф тактических позиций из поля',
    rootNodeId: 'root',
    blackboardDefaults: {},
    blackboardSchema: [],
    subgraphRefs: [],
    nodes: [
      { id: 'root', type: 'Root', children: ['create', 'filter', 'score', 'select'], parameters: {} },
      {
        id: 'create', type: 'CreateCoverCandidates', children: [],
        parameters: { queryKey: 'cover_query', maxCandidates: 8, searchRadiusMeters: 50, maxCalculationMs: 12 },
      },
      {
        id: 'filter', type: 'FilterTacticalPositions', children: [],
        parameters: {
          queryKey: 'cover_query', requireOnMap: true, requireRoute: true,
          minimumDistanceMeters: 0, maximumDistanceMeters: 50,
          requireDirectionalCover: true, maxRouteDanger: 80,
        },
      },
      {
        id: 'score', type: 'ScoreTacticalPositions', children: [],
        parameters: {
          queryKey: 'cover_query', protectionWeight: 1, concealmentWeight: 0.35,
          distanceWeight: 0.4, routeDangerWeight: 0.8, slopeWeight: 0.45,
          orderAlignmentWeight: 0.35,
        },
      },
      {
        id: 'select', type: 'SelectBestTacticalPosition', children: [],
        parameters: { queryKey: 'cover_query', writeTo: 'best_cover_position' },
      },
    ],
  };
}
