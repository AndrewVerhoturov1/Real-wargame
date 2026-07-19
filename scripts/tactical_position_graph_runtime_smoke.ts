import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  clearTacticalPositionProvider,
  installTacticalPositionProvider,
} from '../src/core/tactical/TacticalPositionProvider';
import type { UnitModel } from '../src/core/units/UnitModel';

const unit = { id: 'field-driven-unit' } as UnitModel;
const state = { units: [unit] } as unknown as SimulationState;
let providerCalls = 0;

installTacticalPositionProvider(state, {
  generate: (requestedUnit, request) => {
    providerCalls += 1;
    assert.equal(requestedUnit, unit);
    assert.equal(request.unitId, unit.id);
    assert.equal(request.searchRadiusMeters, 50);
    return {
      elapsedMs: 0,
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
        },
      }],
    };
  },
});

const result = runAiGraphRuntime({
  graph: tacticalPositionGraph(),
  unitId: unit.id,
  blackboard: { self_position: { x: 1.5, y: 4.5 } },
  nowMs: 1000,
});

assert.equal(result.ok, true);
assert.equal(result.status, 'success');
assert.equal(providerCalls, 1, 'Graph v2 must query the registered prepared-field provider exactly once');
assert.deepEqual(result.blackboard.best_cover_position, { x: 8.5, y: 4.5 });
assert.equal(result.tacticalQueries.cover_query?.winnerCandidateId, 'tactical:8:4:prone');
assert.equal(result.tacticalQueries.cover_query?.candidates[0]?.source.kind, 'terrain');

clearTacticalPositionProvider(state);
const unavailable = runAiGraphRuntime({
  graph: tacticalPositionGraph(),
  unitId: unit.id,
  blackboard: { self_position: { x: 1.5, y: 4.5 } },
  nowMs: 2000,
});
assert.equal(unavailable.ok, false);
assert.equal(unavailable.tacticalQueries.cover_query?.stopReason?.code, 'host_unavailable');

console.log('Tactical position Graph v2 smoke passed: registered field provider supplies candidates and teardown removes access without synchronous fallback.');

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
        id: 'create',
        type: 'CreateCoverCandidates',
        children: [],
        parameters: {
          queryKey: 'cover_query',
          maxCandidates: 8,
          searchRadiusMeters: 50,
          maxCalculationMs: 12,
        },
      },
      {
        id: 'filter',
        type: 'FilterTacticalPositions',
        children: [],
        parameters: {
          queryKey: 'cover_query',
          requireOnMap: true,
          requireRoute: true,
          minimumDistanceMeters: 0,
          maximumDistanceMeters: 50,
          requireDirectionalCover: true,
          maxRouteDanger: 80,
        },
      },
      {
        id: 'score',
        type: 'ScoreTacticalPositions',
        children: [],
        parameters: {
          queryKey: 'cover_query',
          protectionWeight: 1,
          concealmentWeight: 0.35,
          distanceWeight: 0.4,
          routeDangerWeight: 0.8,
          slopeWeight: 0.45,
          orderAlignmentWeight: 0.35,
        },
      },
      {
        id: 'select',
        type: 'SelectBestTacticalPosition',
        children: [],
        parameters: { queryKey: 'cover_query', writeTo: 'best_cover_position' },
      },
    ],
  };
}
