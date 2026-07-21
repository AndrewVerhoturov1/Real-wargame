import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraph } from '../src/core/ai/AiGraphRunner';
import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from '../src/core/ai/contracts/AiNodeContractRegistry';
import type { TacticalQueryGenerationRequest } from '../src/core/ai/tactical/TacticalQuery';

const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.require('CreateTacticalPositionCandidates');
const kindParameter = contract.parameters.find((parameter) => parameter.id === 'kind');
const targetModeParameter = contract.parameters.find((parameter) => parameter.id === 'targetMode');
assert.equal(kindParameter?.defaultValue, 'defense');
assert.deepEqual(kindParameter?.options?.map((option) => option.value), ['observation', 'defense', 'firing']);
assert.equal(targetModeParameter?.defaultValue, 'automatic');
assert.ok(DEFAULT_AI_NODE_CONTRACT_REGISTRY.has('CreateCoverCandidates'));

for (const kind of ['observation', 'defense', 'firing'] as const) {
  verifyGraphRoundTripAndExecution(newGraph(kind), kind);
}
verifyGraphRoundTripAndExecution(legacyGraph(), 'defense');
verifyMissingParametersUseDefaults();

console.log('tactical position graph compatibility smoke: ok');

function verifyGraphRoundTripAndExecution(graph: AiGraph, expectedKind: 'observation' | 'defense' | 'firing'): void {
  const restored = JSON.parse(JSON.stringify(graph)) as AiGraph;
  assert.deepEqual(restored, graph, 'graph must survive JSON save/load without losing tactical parameters');
  let captured: TacticalQueryGenerationRequest | null = null;
  const result = runAiGraph({
    graph: restored,
    unitId: 'unit-graph-test',
    blackboard: {},
    nowMs: 1000,
    tacticalHost: {
      generateCoverCandidates: (request) => {
        captured = request;
        return {
          kind: expectedKind,
          candidates: [candidate(expectedKind)],
          elapsedMs: 0,
          requestId: `${expectedKind}:request`,
          requestStatus: 'ready',
        };
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(captured?.kind, expectedKind);
  assert.equal(result.tacticalQueries.query?.kind, expectedKind);
  assert.equal(result.tacticalQueries.query?.searchRequestStatus, 'ready');
}

function verifyMissingParametersUseDefaults(): void {
  let captured: TacticalQueryGenerationRequest | null = null;
  const graph: AiGraph = {
    version: 2,
    id: 'missing-parameters',
    name: 'Missing parameters',
    rootNodeId: 'root',
    blackboardDefaults: {},
    blackboardSchema: [],
    subgraphRefs: [],
    nodes: [
      { id: 'root', type: 'Root', children: ['create'], parameters: {} },
      { id: 'create', type: 'CreateTacticalPositionCandidates', children: [], parameters: {} },
    ],
  };
  const result = runAiGraph({
    graph,
    unitId: 'unit-defaults',
    blackboard: {},
    nowMs: 1000,
    tacticalHost: {
      generateCoverCandidates: (request) => {
        captured = request;
        return { kind: 'defense', candidates: [candidate('defense')], elapsedMs: 0 };
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(captured?.kind, 'defense');
  assert.equal(captured?.queryKey, 'tactical_position_query');
  assert.equal(captured?.maxCandidates, 12);
  assert.equal(captured?.searchRadiusMeters, 50);
}

function newGraph(kind: 'observation' | 'defense' | 'firing'): AiGraph {
  return {
    version: 2,
    id: `new-${kind}`,
    name: `New ${kind}`,
    rootNodeId: 'root',
    blackboardDefaults: {},
    blackboardSchema: [],
    subgraphRefs: [],
    nodes: [
      { id: 'root', type: 'Root', children: ['create'], parameters: {} },
      {
        id: 'create',
        type: 'CreateTacticalPositionCandidates',
        children: [],
        parameters: {
          kind,
          objective: 'balanced',
          queryKey: 'query',
          maxCandidates: 4,
          searchRadiusMeters: 30,
          maximumRouteCost: 1000,
          maxPositionDanger: 80,
          preliminaryCandidates: 8,
          exactCandidates: 4,
          exactRayLimit: 4,
          targetMode: 'facing_sector',
          sectorCenterDegrees: 15,
          sectorArcDegrees: 90,
          maxCalculationMs: 12,
        },
      },
    ],
  };
}

function legacyGraph(): AiGraph {
  return {
    version: 2,
    id: 'legacy-cover',
    name: 'Legacy cover',
    rootNodeId: 'root',
    blackboardDefaults: {},
    blackboardSchema: [],
    subgraphRefs: [],
    nodes: [
      { id: 'root', type: 'Root', children: ['create'], parameters: {} },
      {
        id: 'create',
        type: 'CreateCoverCandidates',
        children: [],
        parameters: {
          queryKey: 'query',
          maxCandidates: 4,
          searchRadiusMeters: 30,
          maxCalculationMs: 12,
        },
      },
    ],
  };
}

function candidate(kind: 'observation' | 'defense' | 'firing') {
  return {
    id: `${kind}:candidate`,
    kind,
    position: { x: 4.5, y: 4.5 },
    source: { kind: 'static_basis' as const, id: 'static:1', label: 'Candidate', labelRu: 'Кандидат' },
    metrics: {
      onMap: true,
      routeExists: true,
      distanceMeters: 5,
      blocksThreat: kind === 'defense',
      protection: 60,
      concealment: 30,
      routeDanger: 10,
      slopeType: 'flat' as const,
      orderAlignment: 50,
      recommendedPosture: 'crouched' as const,
      recommendedFacingRadians: 0,
    },
  };
}
