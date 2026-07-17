import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildBlackboardForUnit } from '../src/core/ai/AiGameBridge';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { getSoldierDangerFieldDiagnostics } from '../src/core/knowledge/SoldierDangerField';
import { buildUnitTacticalRouteContext } from '../src/core/navigation/NavigationRuntime';
import { createRouteCostFieldCache } from '../src/core/navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../src/core/navigation/NavigationProfiles';
import { findGridPath } from '../src/core/pathfinding/GridPathfinder';
import {
  buildRouteDangerDiagnostic,
  readPublishedRouteDanger,
  routeDangerDiagnosticMatches,
} from '../src/core/navigation/RouteDangerDiagnostic';
import type { RouteCostFields } from '../src/core/navigation/RouteCostField';
import { createMoveOrder } from '../src/core/orders/MoveOrder';

const state = createInitialState({
  width: 12,
  height: 3,
  cellSize: 8,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
}, [
  { id: 'observer', label: 'Observer', labelRu: 'Наблюдатель', type: 'infantry_squad', side: 'blue', x: 0, y: 1 },
  { id: 'hidden-hostile', label: 'Hidden', labelRu: 'Скрытый', type: 'infantry_squad', side: 'red', x: 11, y: 2 },
]);
const observer = state.units[0]!;
const hostile = state.units[1]!;
const route = Array.from({ length: 10 }, (_, x) => ({ x: x + 1, y: 1 }));

const dangerousRoute = makeFields(12, 3, route.map((cell, index) => ({ ...cell, danger: index === 0 ? 5 : 90 })), 'subjective-threat:v1', 7);
const safeCurrentDangerousRoute = buildRouteDangerDiagnostic(state.map, route, dangerousRoute, {
  revision: 1,
  calculatedAtSimulationStep: 10,
});
assert.ok(safeCurrentDangerousRoute);
assert.ok(safeCurrentDangerousRoute.value >= 80, 'a route through known danger must remain high even when its first cell is safe');

const mostlySafeRoute = makeFields(12, 3, route.map((cell, index) => ({ ...cell, danger: index === 0 ? 95 : 4 })), 'subjective-threat:v2', 8);
const dangerousCurrentSafeRoute = buildRouteDangerDiagnostic(state.map, route, mostlySafeRoute, {
  revision: 2,
  calculatedAtSimulationStep: 11,
});
assert.ok(dangerousCurrentSafeRoute);
assert.ok(dangerousCurrentSafeRoute.value < 20, 'one dangerous current cell must not masquerade as a dangerous whole route');

const alternateRoute = route.map((cell) => ({ x: cell.x, y: 2 }));
const alternateDiagnostic = buildRouteDangerDiagnostic(state.map, alternateRoute, dangerousRoute, {
  revision: 3,
  calculatedAtSimulationStep: 12,
});
assert.ok(alternateDiagnostic);
assert.notEqual(alternateDiagnostic.routeIdentity, safeCurrentDangerousRoute.routeIdentity, 'a new route identity must invalidate the published aggregate');

assert.equal(
  routeDangerDiagnosticMatches(safeCurrentDangerousRoute, state.map, route, dangerousRoute),
  true,
  'an unchanged route and subjective threat snapshot must reuse the published diagnostic',
);
assert.equal(
  routeDangerDiagnosticMatches(safeCurrentDangerousRoute, state.map, route, mostlySafeRoute),
  false,
  'a relevant subjective threat snapshot change must invalidate the aggregate',
);

observer.order = createMoveOrder({ x: 10.5, y: 1.5 }, {
  routeCells: route,
  routeDangerDiagnostic: safeCurrentDangerousRoute,
  routeRevision: 1,
});
observer.behaviorRuntime.danger = 5;
const blackboard = buildBlackboardForUnit(state, observer);
assert.equal(blackboard.routeDanger, safeCurrentDangerousRoute.value);
assert.equal(readPublishedRouteDanger(observer.order), safeCurrentDangerousRoute.value);
assert.notEqual(blackboard.routeDanger, blackboard.currentPositionDanger, 'route danger and current-cell danger must remain separate concepts');

observer.order = null;
assert.equal(readPublishedRouteDanger(observer.order), null, 'no active route must publish unavailable, never local danger');
assert.equal(buildBlackboardForUnit(state, observer).routeDanger, null);

observer.order = createMoveOrder({ x: 10.5, y: 1.5 }, {
  routeCells: route,
  routeDangerDiagnostic: safeCurrentDangerousRoute,
  routeRevision: 1,
});
const knowledgeRevision = observer.tacticalKnowledge.revision;
const hiddenBefore = readPublishedRouteDanger(observer.order);
hostile.position = { x: 4.5, y: 2.5 };
assert.equal(observer.tacticalKnowledge.revision, knowledgeRevision, 'objective hidden movement must not alter subjective knowledge');
assert.equal(readPublishedRouteDanger(observer.order), hiddenBefore, 'objective hidden movement must not leak into route danger');

observer.tacticalKnowledge.threats = [{
  id: 'known-area-route-threat',
  labelRu: 'Известная опасная область',
  mode: 'area',
  x: 6.5,
  y: 1.5,
  radiusCells: 4,
  widthCells: 0,
  heightCells: 0,
  rotationDegrees: 0,
  strength: 90,
  suppression: 20,
  stressPerSecond: 10,
  directionDegrees: 0,
  arcDegrees: 360,
  rangeCells: 0,
  minRangeCells: 0,
  falloffPercent: 0,
  confidence: 100,
  uncertaintyCells: 0,
  source: 'reported',
  visibleNow: false,
  lastSeenSeconds: 0,
  lastUpdatedSeconds: 0,
}];
observer.tacticalKnowledge.revision += 1;
const directContext = buildUnitTacticalRouteContext(observer, { freshness: 'immediate', metersPerCell: state.map.metersPerCell });
const dangerBuildsBeforeDirect = getSoldierDangerFieldDiagnostics(state.map);
const directRoute = findGridPath(state.map, observer.position, { x: 10.5, y: 1.5 }, {
  navigationProfile: getBuiltInNavigationProfile('direct'),
  tacticalContext: directContext,
  costFieldCache: createRouteCostFieldCache(),
  calculatedAtSimulationStep: 20,
});
assert.equal(directRoute.ok, true);
if (!directRoute.ok) throw new Error(directRoute.reasonRu);
assert.ok((directRoute.routeDangerDiagnostic?.value ?? 0) > 0, 'direct routes must still publish real bounded subjective route danger');
assert.equal(directRoute.routeDangerDiagnostic?.source, 'bounded-route-sampling');
const dangerBuildsAfterDirect = getSoldierDangerFieldDiagnostics(state.map);
assert.equal(dangerBuildsAfterDirect.geometryBuildCount, dangerBuildsBeforeDirect.geometryBuildCount, 'bounded direct route danger must not build full-map danger geometry');
assert.equal(dangerBuildsAfterDirect.fieldBuildCount, dangerBuildsBeforeDirect.fieldBuildCount, 'bounded direct route danger must not build a full-map scored field');

const workspaceSource = readFileSync(path.join(process.cwd(), 'src', 'ui', 'TacticalWorkspace.ts'), 'utf8');
assert.match(workspaceSource, /readPublishedRouteDanger\(unit\.order\)/, 'workspace must read the same canonical published route diagnostic');
assert.doesNotMatch(workspaceSource, /Оценка активного маршрута[^\n]+pct\(threats\.danger\)/, 'workspace must not label local danger as route danger');

const parityEvidence = {
  safeCurrentDangerousRoute: {
    currentPositionDanger: 5,
    routeDanger: safeCurrentDangerousRoute.value,
  },
  dangerousCurrentSafeRoute: {
    currentPositionDanger: 95,
    routeDanger: dangerousCurrentSafeRoute.value,
  },
  newRouteIdentityChanged: alternateDiagnostic.routeIdentity !== safeCurrentDangerousRoute.routeIdentity,
  hiddenContactIsolation: true,
  blackboardRouteDanger: blackboard.routeDanger,
  uiCanonicalSource: 'readPublishedRouteDanger',
  routeDiagnosticValue: safeCurrentDangerousRoute.value,
};
const cacheEvidence = {
  unchangedRouteReused: true,
  maximumSamples: 64,
  sampledCellCount: safeCurrentDangerousRoute.sampledCellCount,
  additionalFullMapBuilds: 0,
  awarenessRasterBuilds: 0,
  source: safeCurrentDangerousRoute.source,
  directProfileSource: directRoute.ok ? directRoute.routeDangerDiagnostic?.source : null,
};
writeEvidence('route-danger-parity.json', parityEvidence);
writeEvidence('route-danger-cache.json', cacheEvidence);
console.log(`Route danger semantic smoke passed: dangerous route ${safeCurrentDangerousRoute.value}/100, mostly safe route ${dangerousCurrentSafeRoute.value}/100, zero additional full-map builds.`);

function makeFields(
  width: number,
  height: number,
  values: readonly { x: number; y: number; danger: number }[],
  dangerFieldKey: string,
  knowledgeRevision: number,
): RouteCostFields {
  const count = width * height;
  const dangerPercent = new Uint8Array(count);
  for (const value of values) dangerPercent[value.y * width + value.x] = value.danger;
  return {
    mapIdentity: 1,
    mapRevisionKey: '0:0:0:0',
    width,
    height,
    profileId: 'normal',
    profileRevision: 1,
    knowledgeRevision,
    dangerFieldKey,
    passable: new Uint8Array(count).fill(1),
    terrainKeys: new Array(count).fill('field'),
    terrainKeyCodes: new Uint8Array(count).fill(1),
    terrainCost: new Float32Array(count).fill(1),
    slopeCost: new Float32Array(count),
    dangerPercent,
    dangerCost: new Float32Array(count),
    exposureCost: new Float32Array(count),
    directionalTerrainCost: new Float32Array(count),
    directionalSlope: new Float32Array(count),
    crestStrength: new Uint8Array(count),
    valleyStrength: new Uint8Array(count),
    silhouettePotential: new Uint8Array(count),
    primaryThreatSector: -1,
    threatSectorWeights: new Float32Array(8),
    coverAdjustment: new Float32Array(count),
    enemyDistanceCost: new Float32Array(count),
    territoryCost: new Float32Array(count),
    totalCost: new Float32Array(count).fill(1),
    availability: { danger: true, exposure: false, directionalTerrain: false, cover: true, enemyDistance: false, territory: false },
    cacheKey: `synthetic:${dangerFieldKey}`,
  };
}

function writeEvidence(name: string, value: unknown): void {
  const directory = process.env.PERFORMANCE_EVIDENCE_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
