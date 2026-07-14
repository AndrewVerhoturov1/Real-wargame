import assert from 'node:assert/strict';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import { syncSoldierThreatMemory } from '../src/core/knowledge/SoldierThreatMemory';
import { getMapRevisionSnapshot, markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import { createDefaultNavigationProfileRegistry } from '../src/core/navigation/NavigationProfiles';
import { getRouteCostFieldDiagnostics, getRouteCostFields, type TacticalRouteContext } from '../src/core/navigation/RouteCostField';
import { getDirectionalTacticalField, getDirectionalTacticalFieldDiagnostics } from '../src/core/terrain/DirectionalTacticalField';
import { getDirectionalTerrainPositionQueryDiagnostics, queryDirectionalTerrainPositions } from '../src/core/terrain/DirectionalTerrainPositionQuery';
import { getDirectionalTerrainStaticGrid } from '../src/core/terrain/DirectionalTerrainStaticGrid';
import {
  CREST, CREST_X, EAST, FORWARD, HEIGHT, QUERY_EXACT_LIMIT, QUERY_RADIUS,
  QUERY_ROUGH_LIMIT, REVERSE, WEST, WIDTH, awarenessCell, evaluateScenario,
  hasObjectiveLeak, installSubjectiveContact, makeScenario, observer, routeCell,
  routeContext, routeSideCount, threatSnapshot, updateSubjectiveContact,
  type ScenarioEvaluation,
} from './reverse_slope_comparative_fixture';

const profile = createDefaultNavigationProfileRegistry().getProfile('retreat');
const flatState = makeScenario('flat', false);
const slopeState = makeScenario('slope', true);
assertEquivalentScenes();

const flatContact = installSubjectiveContact(flatState, EAST);
const eastContact = installSubjectiveContact(slopeState, EAST);
assert.deepEqual(threatSnapshot(flatContact.threat), threatSnapshot(eastContact.threat));

const flat = evaluateScenario(flatState, profile);
const east = evaluateScenario(slopeState, profile);
console.log(JSON.stringify({ scenario: 'reverse-slope-pre-assert', flat: summary(flat), eastThreat: summary(east) }));
assertReverseSlopeBenefit(flat, east);
assertIdenticalQueriesHitCache(east);
assertHiddenObjectiveMovementDoesNotLeak(eastContact, east);

const westContact = updateSubjectiveContact(slopeState, eastContact, WEST);
const west = evaluateScenario(slopeState, profile, east.routeCache);
assertDirectionReversal(east, west, eastContact.threat, westContact.threat);
assertDynamicOnlyInvalidation(east, west);
assertKnowledgeRevisionInvalidation(west);
assertMapRevisionInvalidation(west);

console.log(JSON.stringify({
  scenario: 'reverse-slope-comparative-stage1',
  flat: summary(flat),
  eastThreat: summary(east),
  westThreat: summary(west),
}));
console.log('Reverse slope comparative smoke passed.');

function assertEquivalentScenes() {
  assert.equal(flatState.map.width, slopeState.map.width);
  assert.equal(flatState.map.height, slopeState.map.height);
  assert.equal(flatState.map.cellSize, slopeState.map.cellSize);
  assert.equal(flatState.map.metersPerCell, slopeState.map.metersPerCell);
  assert.deepEqual(flatState.map.objects, slopeState.map.objects);
  assert.deepEqual(observer(flatState).position, observer(slopeState).position);
  let heightDifferences = 0;
  for (let index = 0; index < flatState.map.cells.length; index += 1) {
    const left = flatState.map.cells[index];
    const right = slopeState.map.cells[index];
    assert.equal(left.terrain, right.terrain);
    assert.equal(left.forest, right.forest);
    if (left.height !== right.height) heightDifferences += 1;
  }
  assert.ok(heightDifferences > WIDTH);
}

function assertReverseSlopeBenefit(flat: ScenarioEvaluation, slope: ScenarioEvaluation) {
  const flatReverse = awarenessCell(flat.awareness, REVERSE);
  const slopeReverse = awarenessCell(slope.awareness, REVERSE);
  const flatCrest = awarenessCell(flat.awareness, CREST);
  const slopeCrest = awarenessCell(slope.awareness, CREST);
  const flatForward = awarenessCell(flat.awareness, FORWARD);
  const slopeForward = awarenessCell(slope.awareness, FORWARD);

  assert.ok(slopeReverse.danger + 10 <= flatReverse.danger);
  assert.ok(slopeReverse.safety >= flatReverse.safety + 12);
  assert.ok((flatReverse.danger - slopeReverse.danger) >= (flatCrest.danger - slopeCrest.danger) + 8);
  assert.ok((flatReverse.danger - slopeReverse.danger) >= (flatForward.danger - slopeForward.danger) + 8);
  assert.ok(slopeReverse.reverseSlopeQuality >= 70);
  assert.ok(slopeReverse.expectedProtection >= 45);
  assert.ok(slopeReverse.danger + 10 <= slopeCrest.danger);
  assert.ok(slopeReverse.danger + 10 <= slopeForward.danger);
  assert.ok(slopeReverse.safety >= slopeCrest.safety + 12);
  assert.ok(slopeReverse.safety >= slopeForward.safety + 12);
  assert.ok(slopeCrest.crestRisk >= 45 || slopeCrest.silhouetteRisk >= 45);
  assert.ok(slopeForward.forwardSlopeRisk >= 70);

  assert.ok(flat.winner.position.x >= CREST_X - 0.5);
  assert.ok(slope.winner.position.x < CREST_X + 0.5);
  assert.ok(slope.winner.position.x < flat.winner.position.x);
  const winnerCell = awarenessCell(slope.awareness, { x: Math.floor(slope.winner.position.x), y: Math.floor(slope.winner.position.y) });
  assert.ok(winnerCell.reverseSlopeQuality >= 45);

  assert.ok(flat.route.cells.slice(1, -1).every((cell) => cell.x === CREST_X));
  assert.ok(routeSideCount(slope, 'west') > routeSideCount(slope, 'east'));
  assert.notDeepEqual(slope.route.cells, flat.route.cells);
  assert.ok(slope.route.visitedCells <= WIDTH * HEIGHT);

  assert.ok(Math.abs(routeCell(flat, REVERSE).directionalTerrainCost) < 0.001);
  assert.ok(Math.abs(routeCell(flat, CREST).directionalTerrainCost) < 0.001);
  assert.ok(Math.abs(routeCell(flat, FORWARD).directionalTerrainCost) < 0.001);
  assert.ok(routeCell(slope, REVERSE).directionalTerrainCost < routeCell(slope, CREST).directionalTerrainCost - 0.5);
  assert.ok(routeCell(slope, REVERSE).directionalTerrainCost < routeCell(slope, FORWARD).directionalTerrainCost - 0.5);
  assert.ok(routeCell(slope, REVERSE).directionalSlope < -0.7);
  assert.ok(routeCell(slope, FORWARD).directionalSlope > 0.7);

  const best = slope.query.bestReverseSlopePosition;
  assert.ok(best);
  assert.ok(best.position.x < CREST_X + 0.5);
  assert.ok(best.metrics.reverseSlopeQuality >= 0.7);
  assert.ok(best.metrics.primaryThreatExposure <= 0.35);
  assert.ok(slope.query.exactCandidateCount <= QUERY_EXACT_LIMIT);
}

function assertIdenticalQueriesHitCache(result: ScenarioEvaluation) {
  const routeBefore = getRouteCostFieldDiagnostics(result.routeCache);
  const fields = getRouteCostFields(result.state.map, profile, routeContext(result.blue), result.routeCache);
  const routeAfter = getRouteCostFieldDiagnostics(result.routeCache);
  assert.equal(fields, result.fields);
  assert.deepEqual(routeAfter, routeBefore);

  const directionalBefore = getDirectionalTacticalFieldDiagnostics(result.state.map);
  const field = getDirectionalTacticalField(result.state.map, {
    unitId: result.blue.id,
    originX: result.blue.position.x,
    originY: result.blue.position.y,
    knowledgeRevision: result.blue.tacticalKnowledge.revision,
    threats: result.blue.tacticalKnowledge.threats,
  });
  const directionalAfter = getDirectionalTacticalFieldDiagnostics(result.state.map);
  assert.equal(field, result.directional);
  assert.equal(directionalAfter.buildCount, directionalBefore.buildCount);
  assert.equal(directionalAfter.fullMapScanCount, directionalBefore.fullMapScanCount);
  assert.equal(directionalAfter.cacheHitCount, directionalBefore.cacheHitCount + 1);

  const awareness = buildSoldierAwarenessReport(result.state, result.blue);
  assert.equal(awareness.cacheKey, result.awareness.cacheKey);
  assert.equal(awareness.cells, result.awareness.cells);
  assert.equal(awareness.bestSafePositions, result.awareness.bestSafePositions);

  const queryBefore = getDirectionalTerrainPositionQueryDiagnostics(result.state.map);
  const query = queryDirectionalTerrainPositions(result.state.map, {
    unitId: result.blue.id,
    origin: result.blue.position,
    posture: 'crouched',
    threats: result.blue.tacticalKnowledge.threats,
    knowledgeRevision: result.blue.tacticalKnowledge.revision,
    profile,
    radiusCells: QUERY_RADIUS,
    roughCandidateLimit: QUERY_ROUGH_LIMIT,
    exactCandidateLimit: QUERY_EXACT_LIMIT,
  });
  const queryAfter = getDirectionalTerrainPositionQueryDiagnostics(result.state.map);
  assert.equal(query, result.query);
  assert.equal(queryAfter.buildCount, queryBefore.buildCount);
  assert.equal(queryAfter.exactRayCount, queryBefore.exactRayCount);
  assert.equal(queryAfter.roughCellCount, queryBefore.roughCellCount);
  assert.equal(queryAfter.cacheHitCount, queryBefore.cacheHitCount + 1);
}

function assertHiddenObjectiveMovementDoesNotLeak(installed: ReturnType<typeof installSubjectiveContact>, east: ScenarioEvaluation) {
  const remembered = { x: installed.threat.x, y: installed.threat.y };
  installed.red.position = { ...WEST };
  slopeState.simulationTimeSeconds += 0.5;
  syncSoldierThreatMemory(slopeState, installed.blue, 0);
  const threat = installed.blue.tacticalKnowledge.threats[0];
  assert.ok(threat);
  assert.deepEqual({ x: threat.x, y: threat.y }, remembered);
  assert.notDeepEqual({ x: threat.x, y: threat.y }, installed.red.position);
  assert.equal(installed.blue.tacticalKnowledge.revision, installed.revision);
  assert.equal(hasObjectiveLeak(threat), false);
  assert.equal(getRouteCostFields(slopeState.map, profile, routeContext(installed.blue), east.routeCache), east.fields);
  assert.equal(buildSoldierAwarenessReport(slopeState, installed.blue).cells, east.awareness.cells);
}

function assertDirectionReversal(east: ScenarioEvaluation, west: ScenarioEvaluation, eastThreat: ScenarioEvaluation['threat'], westThreat: ScenarioEvaluation['threat']) {
  assert.equal(westThreat.confidence, eastThreat.confidence);
  assert.equal(westThreat.uncertaintyCells, eastThreat.uncertaintyCells);
  assert.equal(westThreat.strength, eastThreat.strength);
  assert.ok(angleDifference(eastThreat.directionDegrees, westThreat.directionDegrees) >= 170);
  assert.ok(east.winner.position.x < CREST_X + 0.5);
  assert.ok(west.winner.position.x > CREST_X + 0.5);
  assert.ok(routeSideCount(east, 'west') > routeSideCount(east, 'east'));
  assert.ok(routeSideCount(west, 'east') > routeSideCount(west, 'west'));
  assert.notDeepEqual(west.route.cells, east.route.cells);
  assert.ok(east.query.bestReverseSlopePosition && east.query.bestReverseSlopePosition.position.x < CREST_X + 0.5);
  assert.ok(west.query.bestReverseSlopePosition && west.query.bestReverseSlopePosition.position.x > CREST_X + 0.5);
  const protectedCell = awarenessCell(west.awareness, FORWARD);
  const exposedCell = awarenessCell(west.awareness, REVERSE);
  assert.ok(protectedCell.reverseSlopeQuality >= 70);
  assert.ok(protectedCell.danger + 10 <= exposedCell.danger);
  assert.ok(protectedCell.safety >= exposedCell.safety + 12);
}

function assertDynamicOnlyInvalidation(east: ScenarioEvaluation, west: ScenarioEvaluation) {
  assert.equal(west.routeCache, east.routeCache);
  assert.equal(west.routeDiagnostics.staticCostBuildCount, east.routeDiagnostics.staticCostBuildCount);
  assert.equal(west.routeDiagnostics.dynamicCostBuildCount, east.routeDiagnostics.dynamicCostBuildCount + 1);
  assert.equal(west.routeDiagnostics.fullMapScanCount, east.routeDiagnostics.fullMapScanCount + 1);
  assert.equal(west.directionalDiagnostics.buildCount, east.directionalDiagnostics.buildCount + 1);
  assert.equal(west.directionalDiagnostics.fullMapScanCount, east.directionalDiagnostics.fullMapScanCount + 1);
  assert.equal(west.queryDiagnostics.buildCount, east.queryDiagnostics.buildCount + 1);
  const rayDelta = west.queryDiagnostics.exactRayCount - east.queryDiagnostics.exactRayCount;
  const roughDelta = west.queryDiagnostics.roughCellCount - east.queryDiagnostics.roughCellCount;
  assert.ok(rayDelta > 0 && rayDelta <= QUERY_EXACT_LIMIT + 1);
  assert.ok(roughDelta > 0 && roughDelta < WIDTH * HEIGHT);
  assert.notEqual(west.fields.cacheKey, east.fields.cacheKey);
  assert.notEqual(west.directional.key, east.directional.key);
}

function assertKnowledgeRevisionInvalidation(west: ScenarioEvaluation) {
  const routeBefore = getRouteCostFieldDiagnostics(west.routeCache);
  const directionalBefore = getDirectionalTacticalFieldDiagnostics(slopeState.map);
  const context = routeContext(west.blue);
  const nextContext: TacticalRouteContext = { ...context, knowledgeRevision: context.knowledgeRevision + 1 };
  const fields = getRouteCostFields(slopeState.map, profile, nextContext, west.routeCache);
  const routeAfter = getRouteCostFieldDiagnostics(west.routeCache);
  const directionalAfter = getDirectionalTacticalFieldDiagnostics(slopeState.map);
  assert.notEqual(fields.cacheKey, west.fields.cacheKey);
  assert.equal(routeAfter.staticCostBuildCount, routeBefore.staticCostBuildCount);
  assert.equal(routeAfter.dynamicCostBuildCount, routeBefore.dynamicCostBuildCount + 1);
  assert.equal(routeAfter.fullMapScanCount, routeBefore.fullMapScanCount + 1);
  assert.equal(directionalAfter.buildCount, directionalBefore.buildCount);
  assert.equal(directionalAfter.cacheHitCount, directionalBefore.cacheHitCount + 1);
}

function assertMapRevisionInvalidation(west: ScenarioEvaluation) {
  const revisionsBefore = getMapRevisionSnapshot(slopeState.map);
  const staticBefore = getDirectionalTerrainStaticGrid(slopeState.map);
  const routeBefore = getRouteCostFieldDiagnostics(west.routeCache);
  slopeState.map.cells[0].height = -1;
  markMapCellsDirty(slopeState.map, 'height', { minX: 0, minY: 0, maxX: 0, maxY: 0 });
  const revisionsAfter = getMapRevisionSnapshot(slopeState.map);
  assert.equal(revisionsAfter.height, revisionsBefore.height + 1);
  assert.equal(revisionsAfter.visual, revisionsBefore.visual + 1);
  const staticAfter = getDirectionalTerrainStaticGrid(slopeState.map);
  assert.notEqual(staticAfter, staticBefore);
  assert.equal(staticAfter.mapVisualRevision, revisionsAfter.visual);
  const fields = getRouteCostFields(slopeState.map, profile, routeContext(west.blue), west.routeCache);
  const routeAfter = getRouteCostFieldDiagnostics(west.routeCache);
  assert.notEqual(fields.cacheKey, west.fields.cacheKey);
  assert.equal(routeAfter.staticCostBuildCount, routeBefore.staticCostBuildCount + 1);
  assert.equal(routeAfter.dynamicCostBuildCount, routeBefore.dynamicCostBuildCount + 1);
  assert.equal(routeAfter.fullMapScanCount, routeBefore.fullMapScanCount + 2);
  const repeated = getRouteCostFields(slopeState.map, profile, routeContext(west.blue), west.routeCache);
  assert.equal(repeated, fields);
}

function angleDifference(left: number, right: number) {
  const difference = Math.abs((((left % 360) + 360) % 360) - (((right % 360) + 360) % 360));
  return Math.min(difference, 360 - difference);
}

function summary(result: ScenarioEvaluation) {
  return {
    threat: { x: result.threat.x, y: result.threat.y, revision: result.knowledgeRevision },
    reverse: awarenessCell(result.awareness, REVERSE),
    crest: awarenessCell(result.awareness, CREST),
    forward: awarenessCell(result.awareness, FORWARD),
    winner: result.winner.position,
    reverseQueryWinner: result.query.bestReverseSlopePosition?.position ?? null,
    route: result.route.cells,
    visitedCells: result.route.visitedCells,
    routeDiagnostics: getRouteCostFieldDiagnostics(result.routeCache),
    directionalDiagnostics: getDirectionalTacticalFieldDiagnostics(result.state.map),
    queryDiagnostics: getDirectionalTerrainPositionQueryDiagnostics(result.state.map),
  };
}
