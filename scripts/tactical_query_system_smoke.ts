import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraph, type AiGraphTacticalHost } from '../src/core/ai/AiGraphRunner';
import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from '../src/core/ai/contracts/AiNodeContractRegistry';
import type {
  TacticalPositionCandidateSeed,
  TacticalQueryGenerationRequest,
} from '../src/core/ai/tactical/TacticalQuery';

verifyWinnerIsSelectedFromSeveralCandidates();
verifyDangerousAndUnreachableCandidatesAreExcluded();
verifyChangingWeightsChangesWinner();
verifyCandidateBudgetStopsTheQuery();
verifyNoSelectionNodeDoesNotWriteBestCover();
verifyEmptyGraphDoesNotSearchForCover();
verifyRussianNodeContracts();

console.log('Tactical Query System smoke passed: explicit generation, filtering, scoring, selection, budgets, diagnostics and inert empty graph.');

function verifyWinnerIsSelectedFromSeveralCandidates(): void {
  const host = hostWithCandidates([
    candidate('near-weak', 2, 0, { protection: 35, concealment: 30, distanceMeters: 2 }),
    candidate('far-strong', 6, 0, { protection: 90, concealment: 65, distanceMeters: 6, slopeType: 'reverse' }),
  ]);
  const result = runAiGraph(runInput(graphWithPipeline(), host));
  const query = result.tacticalQueries.cover_query;

  assert.equal(result.ok, true);
  assert.ok(query, 'cover query diagnostics must be present');
  assert.equal(query?.winnerCandidateId, 'far-strong');
  assert.deepEqual(result.blackboard.best_cover_position, { x: 6, y: 0 });
  assert.equal(query?.candidates.length, 2);
  assert.ok((query?.candidates[1]?.scoreBreakdown.protection ?? 0) > 0);
}

function verifyDangerousAndUnreachableCandidatesAreExcluded(): void {
  const host = hostWithCandidates([
    candidate('safe', 3, 0, { protection: 70, routeDanger: 20 }),
    candidate('dangerous-route', 4, 0, { protection: 95, routeDanger: 95 }),
    candidate('unreachable', 5, 0, { protection: 100, routeExists: false }),
    candidate('wrong-side', 6, 0, { protection: 100, blocksThreat: false }),
  ]);
  const result = runAiGraph(runInput(graphWithPipeline({ maxRouteDanger: 80 }), host));
  const query = result.tacticalQueries.cover_query;
  const dangerous = query?.candidates.find((item) => item.id === 'dangerous-route');
  const unreachable = query?.candidates.find((item) => item.id === 'unreachable');
  const wrongSide = query?.candidates.find((item) => item.id === 'wrong-side');

  assert.equal(query?.winnerCandidateId, 'safe');
  assert.equal(dangerous?.excluded, true);
  assert.ok(dangerous?.exclusionReasons.some((reason) => reason.code === 'route_too_dangerous'));
  assert.equal(unreachable?.excluded, true);
  assert.ok(unreachable?.exclusionReasons.some((reason) => reason.code === 'route_unavailable'));
  assert.equal(wrongSide?.excluded, true);
  assert.ok(wrongSide?.exclusionReasons.some((reason) => reason.code === 'does_not_block_threat'));
}

function verifyChangingWeightsChangesWinner(): void {
  const seeds = [
    candidate('armored', 7, 0, {
      protection: 100,
      concealment: 5,
      distanceMeters: 7,
      routeDanger: 35,
      slopeType: 'direct',
      orderAlignment: 10,
    }),
    candidate('hidden', 3, 0, {
      protection: 55,
      concealment: 95,
      distanceMeters: 3,
      routeDanger: 5,
      slopeType: 'reverse',
      orderAlignment: 95,
    }),
  ];
  const protectionResult = runAiGraph(runInput(graphWithPipeline({
    protectionWeight: 3,
    concealmentWeight: 0,
    distanceWeight: 0,
    routeDangerWeight: 0,
    slopeWeight: 0,
    orderAlignmentWeight: 0,
  }), hostWithCandidates(seeds)));
  const tacticalResult = runAiGraph(runInput(graphWithPipeline({
    protectionWeight: 0.2,
    concealmentWeight: 1.5,
    distanceWeight: 0.8,
    routeDangerWeight: 1,
    slopeWeight: 1,
    orderAlignmentWeight: 1,
  }), hostWithCandidates(seeds)));

  assert.equal(protectionResult.tacticalQueries.cover_query?.winnerCandidateId, 'armored');
  assert.equal(tacticalResult.tacticalQueries.cover_query?.winnerCandidateId, 'hidden');
}

function verifyCandidateBudgetStopsTheQuery(): void {
  let receivedRequest: TacticalQueryGenerationRequest | undefined;
  const seeds = [
    candidate('one', 1, 0),
    candidate('two', 2, 0),
    candidate('three', 3, 0),
    candidate('four', 4, 0),
  ];
  const host: AiGraphTacticalHost = {
    generateCoverCandidates: (request) => {
      receivedRequest = request;
      return { candidates: seeds, elapsedMs: 1 };
    },
  };
  const result = runAiGraph(runInput(graphWithPipeline({ maxCandidates: 2 }), host));
  const query = result.tacticalQueries.cover_query;

  assert.equal(receivedRequest?.maxCandidates, 2);
  assert.equal(query?.candidates.length, 2);
  assert.equal(query?.stopReason?.code, 'max_candidates');
  assert.match(query?.stopReason?.reasonRu ?? '', /кандидат/i);
}

function verifyNoSelectionNodeDoesNotWriteBestCover(): void {
  const result = runAiGraph(runInput(graphWithPipeline({}, false), hostWithCandidates([
    candidate('available', 4, 0),
  ])));

  assert.equal(result.ok, true);
  assert.ok(result.tacticalQueries.cover_query);
  assert.equal(Object.prototype.hasOwnProperty.call(result.blackboard, 'best_cover_position'), false);
}

function verifyEmptyGraphDoesNotSearchForCover(): void {
  let calls = 0;
  const host: AiGraphTacticalHost = {
    generateCoverCandidates: () => {
      calls += 1;
      return { candidates: [candidate('forbidden-background-search', 1, 1)], elapsedMs: 0 };
    },
  };
  const result = runAiGraph(runInput(emptyGraph(), host));

  assert.equal(result.ok, true);
  assert.equal(calls, 0);
  assert.deepEqual(result.tacticalQueries, {});
  assert.equal(Object.prototype.hasOwnProperty.call(result.blackboard, 'best_cover_position'), false);
}

function verifyRussianNodeContracts(): void {
  const expected = new Map([
    ['CreateCoverCandidates', 'Создать кандидаты укрытий'],
    ['FilterTacticalPositions', 'Фильтр тактических позиций'],
    ['ScoreTacticalPositions', 'Оценить позиции'],
    ['SelectBestTacticalPosition', 'Выбрать лучшую позицию'],
  ]);
  for (const [type, labelRu] of expected) {
    const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.require(type);
    assert.equal(contract.labelRu, labelRu);
    assert.equal(contract.category, 'query');
  }
}

function runInput(graph: AiGraph, tacticalHost: AiGraphTacticalHost) {
  return {
    graph,
    unitId: 'tactical-query-test-soldier',
    blackboard: { self_position: { x: 0, y: 0 } },
    nowMs: 1000,
    tacticalHost,
  };
}

function hostWithCandidates(candidates: readonly TacticalPositionCandidateSeed[]): AiGraphTacticalHost {
  return {
    generateCoverCandidates: () => ({ candidates, elapsedMs: 2 }),
  };
}

interface PipelineOverrides {
  readonly maxCandidates?: number;
  readonly maxRouteDanger?: number;
  readonly protectionWeight?: number;
  readonly concealmentWeight?: number;
  readonly distanceWeight?: number;
  readonly routeDangerWeight?: number;
  readonly slopeWeight?: number;
  readonly orderAlignmentWeight?: number;
}

function graphWithPipeline(overrides: PipelineOverrides = {}, includeSelection = true): AiGraph {
  const children = ['create', 'filter', 'score', ...(includeSelection ? ['select'] : [])];
  return {
    version: 2,
    id: `cover-query-${includeSelection ? 'selected' : 'not-selected'}`,
    name: 'Cover tactical query test',
    nameRu: 'Проверка тактического запроса укрытия',
    rootNodeId: 'root',
    blackboardDefaults: {},
    blackboardSchema: [],
    subgraphRefs: [],
    nodes: [
      { id: 'root', type: 'Root', children, parameters: {} },
      {
        id: 'create',
        type: 'CreateCoverCandidates',
        children: [],
        parameters: {
          queryKey: 'cover_query',
          maxCandidates: overrides.maxCandidates ?? 16,
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
          maxRouteDanger: overrides.maxRouteDanger ?? 100,
        },
      },
      {
        id: 'score',
        type: 'ScoreTacticalPositions',
        children: [],
        parameters: {
          queryKey: 'cover_query',
          protectionWeight: overrides.protectionWeight ?? 1,
          concealmentWeight: overrides.concealmentWeight ?? 0.35,
          distanceWeight: overrides.distanceWeight ?? 0.4,
          routeDangerWeight: overrides.routeDangerWeight ?? 0.8,
          slopeWeight: overrides.slopeWeight ?? 0.45,
          orderAlignmentWeight: overrides.orderAlignmentWeight ?? 0.35,
        },
      },
      ...(includeSelection ? [{
        id: 'select',
        type: 'SelectBestTacticalPosition',
        children: [],
        parameters: { queryKey: 'cover_query', writeTo: 'best_cover_position' },
      }] : []),
    ],
  };
}

function emptyGraph(): AiGraph {
  return {
    version: 2,
    id: 'empty-graph',
    name: 'Empty graph',
    nameRu: 'Пустой граф',
    rootNodeId: 'root',
    blackboardDefaults: {},
    blackboardSchema: [],
    subgraphRefs: [],
    nodes: [{ id: 'root', type: 'Root', children: [], parameters: {} }],
  };
}

function candidate(
  id: string,
  x: number,
  y: number,
  overrides: Partial<TacticalPositionCandidateSeed['metrics']> = {},
): TacticalPositionCandidateSeed {
  return {
    id,
    position: { x, y },
    source: {
      kind: 'map_object',
      id: `source-${id}`,
      label: `Cover ${id}`,
      labelRu: `Укрытие ${id}`,
    },
    metrics: {
      onMap: true,
      routeExists: true,
      distanceMeters: Math.hypot(x, y),
      blocksThreat: true,
      protection: 60,
      concealment: 40,
      routeDanger: 10,
      slopeType: 'flat',
      orderAlignment: 50,
      ...overrides,
    },
  };
}
