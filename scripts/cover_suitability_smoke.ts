import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  buildCoverSuitabilityFromFields,
  coverRejectionReasonAt,
  getCoverSuitability,
  getCoverSuitabilityDiagnostics,
  resetCoverSuitabilityDiagnostics,
} from '../src/core/cover/CoverSuitability';
import { normalizeMap, type TacticalMap } from '../src/core/map/MapModel';
import type { RouteCostFields } from '../src/core/navigation/RouteCostField';
import { createInitialState } from '../src/core/simulation/SimulationState';
import {
  getTacticalOverlayMode,
  setTacticalOverlayMode,
} from '../src/core/ui/RuntimeUiState';

function run(): void {
  testQuickCoverWithinTenMeters();
  testGeometricallyCloseButUnreachable();
  testDangerousRouteRejected();
  testFarQualityCover();
  testFarMarginalCoverDoesNotBeatCloserOption();
  testIsolatedMinimumRejected();
  testNeighbouringCellsBecomeOneRegion();
  testOverlayModeDoesNotRebuildSimulation();
  testLegacyRenderersRemoved();
  testDangerAndRouteInvalidation();
  console.log('cover suitability smoke: ok');
}

function testQuickCoverWithinTenMeters(): void {
  const map = makeMap(12, 7);
  const danger = filled(12 * 7, 65);
  setDanger(danger, 12, 1, 3, 70);
  paintDanger(danger, 12, 4, 2, 6, 4, 18);
  const result = buildCoverSuitabilityFromFields(map, 'unit', { x: 1.5, y: 3.5 }, 1, makeFields(map, danger));
  assert.ok(result.bestQuickCoverCandidates.length > 0, 'reachable lower-danger area should be quick cover');
  assert.ok(result.bestQuickCoverCandidates[0].routeLengthMeters <= 10, 'quick cover route must be at most 10 m');
  assert.ok(result.bestQuickCoverCandidates[0].absoluteDangerReduction >= 10);
}

function testGeometricallyCloseButUnreachable(): void {
  const map = makeMap(9, 7);
  const danger = filled(9 * 7, 68);
  setDanger(danger, 9, 1, 3, 70);
  paintDanger(danger, 9, 4, 2, 5, 4, 15);
  const passable = filledBytes(9 * 7, 1);
  for (let y = 0; y < 7; y += 1) passable[y * 9 + 3] = 0;
  const result = buildCoverSuitabilityFromFields(map, 'unit', { x: 1.5, y: 3.5 }, 1, makeFields(map, danger, passable));
  assert.equal(result.bestQuickCoverCandidates.length, 0, 'blocked nearby area must not be quick cover');
  assert.equal(sum(result.quickCoverMask), 0);
  assert.equal(coverRejectionReasonAt(result, 4, 3), 'unreachable');
}

function testDangerousRouteRejected(): void {
  const map = makeMap(10, 5);
  const danger = filled(10 * 5, 68);
  setDanger(danger, 10, 1, 2, 70);
  paintDanger(danger, 10, 2, 0, 4, 4, 96);
  paintDanger(danger, 10, 5, 1, 7, 3, 18);
  const result = buildCoverSuitabilityFromFields(map, 'unit', { x: 1.5, y: 2.5 }, 1, makeFields(map, danger));
  assert.equal(result.bestQuickCoverCandidates.length, 0, 'route through unacceptable danger must be rejected');
  assert.equal(coverRejectionReasonAt(result, 5, 2), 'route-too-dangerous');
}

function testFarQualityCover(): void {
  const map = makeMap(28, 7);
  const danger = filled(28 * 7, 62);
  setDanger(danger, 28, 1, 3, 70);
  paintDanger(danger, 28, 18, 2, 21, 4, 8);
  const result = buildCoverSuitabilityFromFields(map, 'unit', { x: 1.5, y: 3.5 }, 1, makeFields(map, danger));
  assert.ok(result.bestQualityCoverCandidates.length > 0, 'large far improvement should produce quality cover');
  assert.ok(result.bestQualityCoverCandidates[0].routeLengthMeters > 10);
}

function testFarMarginalCoverDoesNotBeatCloserOption(): void {
  const map = makeMap(34, 7);
  const danger = filled(34 * 7, 64);
  setDanger(danger, 34, 1, 3, 70);
  paintDanger(danger, 34, 13, 2, 16, 4, 12);
  paintDanger(danger, 34, 27, 2, 30, 4, 9);
  const result = buildCoverSuitabilityFromFields(map, 'unit', { x: 1.5, y: 3.5 }, 1, makeFields(map, danger));
  assert.ok(result.bestQualityCoverCandidates.length > 0);
  assert.ok(
    result.bestQualityCoverCandidates.every((candidate) => candidate.x < 24),
    'nearly equal far area should be dominated by substantially closer cover',
  );
}

function testIsolatedMinimumRejected(): void {
  const map = makeMap(10, 7);
  const danger = filled(10 * 7, 66);
  setDanger(danger, 10, 1, 3, 70);
  setDanger(danger, 10, 5, 3, 5);
  const result = buildCoverSuitabilityFromFields(map, 'unit', { x: 1.5, y: 3.5 }, 1, makeFields(map, danger));
  assert.equal(result.quickCoverMask[3 * 10 + 5], 0, 'single random minimum must not form a cover region');
  assert.equal(result.qualityCoverMask[3 * 10 + 5], 0);
  assert.equal(coverRejectionReasonAt(result, 5, 3), 'isolated-minimum');
}

function testNeighbouringCellsBecomeOneRegion(): void {
  const map = makeMap(12, 7);
  const danger = filled(12 * 7, 66);
  setDanger(danger, 12, 1, 3, 70);
  paintDanger(danger, 12, 5, 2, 7, 4, 14);
  const result = buildCoverSuitabilityFromFields(map, 'unit', { x: 1.5, y: 3.5 }, 1, makeFields(map, danger));
  const quick = result.bestQuickCoverCandidates[0];
  assert.ok(quick, 'contiguous low-danger cells should produce a region');
  assert.ok(quick.regionAreaCells >= 4, 'neighbouring candidates must be merged');
}

function testOverlayModeDoesNotRebuildSimulation(): void {
  const state = makeRuntimeState();
  const unit = state.units[0];
  resetCoverSuitabilityDiagnostics();
  const first = getCoverSuitability(state, unit);
  const before = getCoverSuitabilityDiagnostics();
  assert.equal(getTacticalOverlayMode(state), 'danger');
  setTacticalOverlayMode(state, 'cover');
  setTacticalOverlayMode(state, 'combined');
  const second = getCoverSuitability(state, unit);
  const after = getCoverSuitabilityDiagnostics();
  assert.equal(first, second, 'display-only mode changes must reuse the same result object');
  assert.equal(after.buildCount, before.buildCount, 'display-only mode change must not rebuild cover simulation');
  assert.ok(after.cacheHitCount > before.cacheHitCount);
}

function testLegacyRenderersRemoved(): void {
  const overlay = readFileSync('src/rendering/PixiOverlayRenderer.ts', 'utf8');
  const tactical = readFileSync('src/rendering/PixiAwarenessHeatmapRenderer.ts', 'utf8');
  const knowledge = readFileSync('src/core/knowledge/UnitKnowledge.ts', 'utf8');
  const workspace = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
  assert.equal(existsSync('src/core/knowledge/SimulationCoverSelection.ts'), false, 'legacy cover selection bridge must be deleted');
  assert.doesNotMatch(overlay, /drawCoverMarker|KnowledgeCover|roundRect\(x - radius/);
  assert.doesNotMatch(tactical, /new Graphics\(\).*for \(const cover|renderer-owned winner/i);
  assert.match(knowledge, /buildObjectCovers/);
  assert.match(knowledge, /buildForestCovers/);
  assert.match(knowledge, /KnowledgeCover/);
  assert.doesNotMatch(workspace, /cover-map-tooltip|setSelectedSimulationCover|hoverSimulationCoverAtPosition/);
  assert.match(tactical, /raster-sprite-with-region-contours/);
  assert.match(tactical, /quickCoverMask/);
  assert.match(tactical, /qualityCoverMask/);
}

function testDangerAndRouteInvalidation(): void {
  const state = makeRuntimeState();
  const unit = state.units[0];
  resetCoverSuitabilityDiagnostics();
  const first = getCoverSuitability(state, unit);
  const cached = getCoverSuitability(state, unit);
  assert.equal(first, cached, 'unchanged fields must use cached result');
  assert.equal(getCoverSuitabilityDiagnostics().buildCount, 1);

  unit.tacticalKnowledge.threats[0].strength += 12;
  unit.tacticalKnowledge.revision += 1;
  const dangerChanged = getCoverSuitability(state, unit);
  assert.notEqual(dangerChanged.cacheKey, first.cacheKey, 'danger field change must invalidate cover cache');
  assert.notEqual(dangerChanged.versions.dangerFieldKey, first.versions.dangerFieldKey);

  unit.playerNavigationProfileId = 'cautious';
  const routeChanged = getCoverSuitability(state, unit);
  assert.notEqual(
    routeChanged.versions.routeCostFieldKey,
    dangerChanged.versions.routeCostFieldKey,
    'route-cost profile change must invalidate route evaluation',
  );
  const stable = getCoverSuitability(state, unit);
  assert.equal(stable, routeChanged, 'unchanged route and danger fields must remain cached');
}

function makeRuntimeState() {
  const state = createInitialState(
    { width: 24, height: 12, cellSize: 10, metersPerCell: 1, defaultTerrain: 'field' },
    [{ id: 'cache-unit', labelRu: 'Тест', type: 'infantry_squad', side: 'blue', x: 2, y: 5, navigationProfileId: 'normal' }],
  );
  state.selectedUnitId = state.units[0].id;
  state.selectedUnitIds = [state.units[0].id];
  state.units[0].tacticalKnowledge = {
    revision: 1,
    lastUpdatedSeconds: 0,
    threats: [{
      id: 'known-fire',
      labelRu: 'Известный огонь',
      mode: 'directional_fire',
      x: 18.5,
      y: 5.5,
      radiusCells: 0,
      widthCells: 1,
      heightCells: 1,
      rotationDegrees: 0,
      strength: 70,
      suppression: 35,
      stressPerSecond: 12,
      directionDegrees: 180,
      arcDegrees: 80,
      rangeCells: 20,
      minRangeCells: 0,
      falloffPercent: 25,
      confidence: 90,
      uncertaintyCells: 0.2,
      source: 'seen',
      visibleNow: true,
      lastSeenSeconds: 0,
      lastUpdatedSeconds: 0,
    }],
  };
  return state;
}

function makeMap(width: number, height: number): TacticalMap {
  return normalizeMap({ width, height, cellSize: 10, metersPerCell: 1, defaultTerrain: 'field' });
}

function makeFields(
  map: TacticalMap,
  danger: Uint8Array,
  passable = filledBytes(map.width * map.height, 1),
  key = 'synthetic',
): RouteCostFields {
  const count = map.width * map.height;
  const floats = (): Float32Array => new Float32Array(count);
  const totalCost = new Float32Array(count);
  totalCost.fill(1);
  return {
    mapIdentity: 1,
    mapRevisionKey: '1:1:1:1',
    width: map.width,
    height: map.height,
    profileId: 'test',
    profileRevision: 1,
    knowledgeRevision: 1,
    dangerFieldKey: `${key}:danger`,
    passable,
    terrainKeys: new Array(count).fill('field'),
    terrainKeyCodes: new Uint8Array(count),
    terrainCost: totalCost.slice(),
    slopeCost: floats(),
    dangerPercent: danger,
    dangerCost: floats(),
    exposureCost: floats(),
    directionalTerrainCost: floats(),
    directionalSlope: floats(),
    crestStrength: new Uint8Array(count),
    valleyStrength: new Uint8Array(count),
    silhouettePotential: new Uint8Array(count),
    primaryThreatSector: -1,
    threatSectorWeights: new Float32Array(0),
    coverAdjustment: floats(),
    enemyDistanceCost: floats(),
    territoryCost: floats(),
    totalCost,
    availability: {
      danger: true,
      exposure: true,
      directionalTerrain: true,
      cover: true,
      enemyDistance: true,
      territory: true,
    },
    cacheKey: `${key}:route`,
  };
}

function filled(length: number, value: number): Uint8Array {
  const result = new Uint8Array(length);
  result.fill(value);
  return result;
}

function filledBytes(length: number, value: number): Uint8Array {
  return filled(length, value);
}

function setDanger(values: Uint8Array, width: number, x: number, y: number, value: number): void {
  values[y * width + x] = value;
}

function paintDanger(values: Uint8Array, width: number, x1: number, y1: number, x2: number, y2: number, value: number): void {
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) values[y * width + x] = value;
  }
}

function sum(values: Uint8Array): number {
  let result = 0;
  for (const value of values) result += value;
  return result;
}

run();
