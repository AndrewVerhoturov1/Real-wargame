import assert from 'node:assert/strict';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import {
  NAVIGATION_PROFILE_FORMAT_VERSION,
  NavigationProfileRegistry,
  createDefaultNavigationProfileRegistry,
} from '../src/core/navigation/NavigationProfiles';
import {
  createRouteCostFieldCache,
  getRouteCostFieldDiagnostics,
  getRouteCostFields,
  readRouteCostCell,
} from '../src/core/navigation/RouteCostField';
import { createInitialState } from '../src/core/simulation/SimulationState';
import {
  getDirectionalTacticalField,
  getDirectionalTacticalFieldDiagnostics,
  readDirectionalTacticalCell,
} from '../src/core/terrain/DirectionalTacticalField';
import {
  getDirectionalTerrainPositionQueryDiagnostics,
  queryDirectionalTerrainPositions,
} from '../src/core/terrain/DirectionalTerrainPositionQuery';
import {
  getDirectionalTerrainStaticGrid,
  sampleDirectionalSlope,
} from '../src/core/terrain/DirectionalTerrainStaticGrid';
import {
  buildThreatDirectionField,
  threatSectorBearingRadians,
} from '../src/core/terrain/ThreatDirectionField';
import { evaluateTerrainVisibilityRay } from '../src/core/visibility/VisibilityRaycast';
import { getVisibilityStaticGrid } from '../src/core/visibility/VisibilityStaticGrid';

verifyStaticSlopeDirectionAndCache();
verifyThreatSectorsAndUncertainty();
verifyProfileMigration();
verifySharedDirectionalTacticalField();
verifyAwarenessLayersUseDirectionalTerrain();
verifyDirectionalRouteCostsAndCacheSeparation();
verifyExactTerrainVisibility();
verifyLocalTacticalPositionQuery();

console.log('Directional terrain smoke passed: shared directional terrain enriches awareness, concealment, cover, safety and route costs while preserving cached derivatives, exact visibility and local position queries.');

function verifyStaticSlopeDirectionAndCache(): void {
  const flat = normalizeMap(makeMap(7, 5, () => 2));
  const flatGrid = getDirectionalTerrainStaticGrid(flat);
  assert.equal(flatGrid, getDirectionalTerrainStaticGrid(flat), 'same map revision must reuse the static directional grid');
  assert.ok(Math.abs(sampleDirectionalSlope(flatGrid, 3, 2, 0)) < 0.001, 'flat terrain must have no directional slope');

  const hill = normalizeMap(makeMap(9, 5, (x) => [0, 1, 2, 3, 4, 3, 2, 1, 0][x]));
  const grid = getDirectionalTerrainStaticGrid(hill);
  const westReverse = sampleDirectionalSlope(grid, 2, 2, 0);
  const eastForward = sampleDirectionalSlope(grid, 6, 2, 0);
  assert.ok(westReverse < -0.25, `west side should be reverse to an eastern threat, received ${westReverse}`);
  assert.ok(eastForward > 0.25, `east side should be forward to an eastern threat, received ${eastForward}`);
  assert.ok(sampleDirectionalSlope(grid, 6, 2, Math.PI) < -0.25, 'reversing threat direction must flip classification');
  assert.ok(grid.crestStrength[2 * grid.width + 4] > 80, 'hill top should be detected as a crest');
}

function verifyThreatSectorsAndUncertainty(): void {
  const field = buildThreatDirectionField(4.5, 4.5, [
    threat('east', 8.5, 4.5, 100, 0.2),
    threat('north', 4.5, 0.5, 75, 0.4),
  ]);
  assert.equal(field.sectorWeights.length, 8);
  assert.ok(field.totalWeight > 0);
  assert.ok(field.primarySector >= 0);
  assert.ok(Math.abs(threatSectorBearingRadians(field.primarySector)) < Math.PI / 4, 'east should be the strongest sector');
  const meaningfulSectors = [...field.normalizedSectorWeights].filter((value) => value > 0.08).length;
  assert.ok(meaningfulSectors >= 2, 'multiple threat directions must remain represented');

  const precise = buildThreatDirectionField(4.5, 4.5, [threat('precise', 8.5, 4.5, 100, 0)]);
  const uncertain = buildThreatDirectionField(4.5, 4.5, [threat('uncertain', 8.5, 4.5, 100, 12)]);
  assert.ok(uncertain.totalWeight < precise.totalWeight * 0.55, 'uncertainty must attenuate directional confidence');
}

function verifyProfileMigration(): void {
  assert.equal(NAVIGATION_PROFILE_FORMAT_VERSION, 2);
  const migrated = NavigationProfileRegistry.fromUnknown({
    formatVersion: 1,
    revision: 2,
    profiles: [{
      id: 'legacy-stealth',
      name: 'Legacy stealth',
      nameRu: 'Старый скрытный',
      exposureWeight: 1.4,
    }],
  });
  const profile = migrated.getProfile('legacy-stealth');
  assert.ok(profile.directionalTerrain.forwardSlopePenalty > 0);
  assert.ok(profile.directionalTerrain.reverseSlopePreference >= 0);
  assert.equal(migrated.formatVersion, 2);
  assert.equal(createDefaultNavigationProfileRegistry().getProfile('direct').directionalTerrain.forwardSlopePenalty, 0);
}

function verifySharedDirectionalTacticalField(): void {
  const map = normalizeMap(makeMap(9, 5, (x) => [0, 1, 2, 3, 4, 3, 2, 1, 0][x]));
  const options = {
    unitId: 'shared-field-soldier',
    knowledgeRevision: 1,
    threats: [directionalThreat('east-threat', 12.5, 2.5)],
  };
  const first = getDirectionalTacticalField(map, options);
  const regressionDigest = digestDirectionalField(first);
  assert.equal(
    regressionDigest,
    '37158ce2',
    'directional tactical projection must preserve the established terrain raster',
  );
  const west = readDirectionalTacticalCell(first, 2, 2);
  const east = readDirectionalTacticalCell(first, 6, 2);
  assert.ok(west && east);
  if (!west || !east) return;
  assert.ok(west.reverseSlopeProtection > east.reverseSlopeProtection + 25, 'reverse side must gain directional protection');
  assert.ok(west.terrainConcealment > east.terrainConcealment + 20, 'reverse side must gain terrain concealment');
  assert.ok(east.forwardSlopeRisk > west.forwardSlopeRisk + 25, 'forward side must gain exposure risk');
  assert.ok(east.silhouetteRisk >= west.silhouetteRisk, 'forward/crest side must not hide silhouette risk');

  const diagnosticsAfterFirst = getDirectionalTacticalFieldDiagnostics(map);
  const second = getDirectionalTacticalField(map, options);
  const diagnosticsAfterSecond = getDirectionalTacticalFieldDiagnostics(map);
  assert.equal(second, first, 'identical map and knowledge revisions must reuse the shared field object');
  assert.equal(diagnosticsAfterSecond.buildCount, diagnosticsAfterFirst.buildCount);
  assert.equal(diagnosticsAfterSecond.cacheHitCount, diagnosticsAfterFirst.cacheHitCount + 1);
}

function verifyAwarenessLayersUseDirectionalTerrain(): void {
  const state = createInitialState(makeMap(9, 5, (x) => [0, 1, 2, 3, 4, 3, 2, 1, 0][x]), [{
    id: 'awareness-soldier',
    labelRu: 'Солдат',
    type: 'scout_team',
    side: 'player',
    x: 4,
    y: 2,
  }]);
  const unit = state.units[0];
  unit.tacticalKnowledge.threats = [directionalThreat('east-threat', 12.5, 2.5)];
  unit.tacticalKnowledge.revision = 7;

  const report = buildSoldierAwarenessReport(state, unit);
  const west = report.cells[2 * state.map.width + 2];
  const east = report.cells[2 * state.map.width + 6];
  assert.ok(west.concealment > east.concealment + 15, 'existing stealth layer must include reverse-slope concealment');
  assert.ok(west.expectedProtection > east.expectedProtection + 15, 'existing cover layer must include directional terrain protection');
  assert.ok(west.danger < east.danger - 10, 'existing danger layer must reduce direct-fire danger behind the reverse slope');
  assert.ok(west.safety > east.safety + 10, 'existing safe-position layer must prefer the reverse slope');
  assert.ok(west.reverseSlopeQuality > east.reverseSlopeQuality + 20);
  assert.match(west.sourceRu, /обратн|склон|рельеф/i, 'cell explanation must name terrain contribution');

  const diagnosticsBeforeRoute = getDirectionalTacticalFieldDiagnostics(state.map);
  const cache = createRouteCostFieldCache();
  getRouteCostFields(state.map, createDefaultNavigationProfileRegistry().getProfile('stealth'), {
    unitId: unit.id,
    posture: unit.behaviorRuntime.posture,
    knowledgeRevision: unit.tacticalKnowledge.revision,
    knownThreats: unit.tacticalKnowledge.threats,
  }, cache);
  const diagnosticsAfterRoute = getDirectionalTacticalFieldDiagnostics(state.map);
  assert.equal(diagnosticsAfterRoute.buildCount, diagnosticsBeforeRoute.buildCount, 'route and awareness layers must share one directional field build');
  assert.ok(diagnosticsAfterRoute.cacheHitCount > diagnosticsBeforeRoute.cacheHitCount, 'route must reuse the awareness directional field cache');
}

function verifyDirectionalRouteCostsAndCacheSeparation(): void {
  const map = normalizeMap(makeMap(9, 5, (x) => [0, 1, 2, 3, 4, 3, 2, 1, 0][x]));
  const registry = createDefaultNavigationProfileRegistry();
  const cache = createRouteCostFieldCache();
  const context = {
    unitId: 'directional-soldier',
    posture: 'standing' as const,
    knowledgeRevision: 1,
    knownThreats: [threat('east-threat', 12.5, 2.5, 100, 0.25)],
  };

  const stealth = getRouteCostFields(map, registry.getProfile('stealth'), context, cache);
  const west = readRouteCostCell(stealth, 2, 2, cache);
  const east = readRouteCostCell(stealth, 6, 2, cache);
  assert.ok(west && east);
  if (!west || !east) return;
  assert.ok(west.directionalSlope < -0.25);
  assert.ok(east.directionalSlope > 0.25);
  assert.ok(east.directionalTerrainCost > west.directionalTerrainCost + 0.2, 'stealth must prefer the reverse side over the forward side');
  assert.ok(east.crestStrength >= 0 && east.crestStrength <= 1);

  const direct = getRouteCostFields(map, registry.getProfile('direct'), context, cache);
  const directEast = readRouteCostCell(direct, 6, 2);
  assert.ok(directEast);
  assert.equal(directEast?.directionalTerrainCost, 0, 'direct profile must ignore tactical directional terrain');

  let diagnostics = getRouteCostFieldDiagnostics(cache);
  const staticBuildsBeforeKnowledgeChange = diagnostics.staticCostBuildCount;
  const dynamicBuildsBeforeKnowledgeChange = diagnostics.dynamicCostBuildCount;
  getRouteCostFields(map, registry.getProfile('stealth'), { ...context, knowledgeRevision: 2 }, cache);
  diagnostics = getRouteCostFieldDiagnostics(cache);
  assert.equal(diagnostics.staticCostBuildCount, staticBuildsBeforeKnowledgeChange, 'knowledge changes must not rebuild static terrain costs');
  assert.equal(diagnostics.dynamicCostBuildCount, dynamicBuildsBeforeKnowledgeChange + 1, 'knowledge changes must rebuild the dynamic directional field once');
}

function verifyExactTerrainVisibility(): void {
  const flat = normalizeMap(makeMap(7, 3, () => 0));
  const flatResult = evaluateTerrainVisibilityRay(
    getVisibilityStaticGrid(flat),
    { x: 0.5, y: 1.5 },
    { x: 6.5, y: 1.5 },
    1.6,
    1.7,
    flat.metersPerCell,
  );
  assert.equal(flatResult.visible, true, 'flat terrain must preserve direct visibility');

  const ridge = normalizeMap(makeMap(7, 3, (x) => x === 3 ? 4 : 0));
  const ridgeResult = evaluateTerrainVisibilityRay(
    getVisibilityStaticGrid(ridge),
    { x: 0.5, y: 1.5 },
    { x: 6.5, y: 1.5 },
    1.6,
    1.7,
    ridge.metersPerCell,
  );
  assert.equal(ridgeResult.visible, false, 'a high intermediate ridge must block the exact ray');
  assert.equal(ridgeResult.blockedBy, 'terrain');
  assert.ok(ridgeResult.occlusionDepthMeters > 1);
}

function digestDirectionalField(field: ReturnType<typeof getDirectionalTacticalField>): string {
  let hash = 0x811c9dc5;
  for (const values of [
    new Uint8Array(field.primarySlope.buffer, field.primarySlope.byteOffset, field.primarySlope.byteLength),
    field.forwardSlopeRisk,
    field.reverseSlopeProtection,
    field.primaryThreatExposure,
    field.flankExposure,
    field.terrainProtection,
    field.terrainConcealment,
  ]) {
    for (const value of values) {
      hash ^= value;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

function verifyLocalTacticalPositionQuery(): void {
  const map = normalizeMap(makeMap(13, 7, (x) => [0, 0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 0][x]));
  const registry = createDefaultNavigationProfileRegistry();
  const options = {
    unitId: 'position-query-soldier',
    origin: { x: 6.5, y: 3.5 },
    posture: 'crouched' as const,
    threats: [threat('east-observer', 12.5, 3.5, 100, 0.25)],
    knowledgeRevision: 4,
    profile: registry.getProfile('stealth'),
    radiusCells: 6,
    roughCandidateLimit: 20,
    exactCandidateLimit: 8,
  };
  const first = queryDirectionalTerrainPositions(map, options);
  const diagnosticsAfterFirst = getDirectionalTerrainPositionQueryDiagnostics(map);
  assert.ok(first.bestReverseSlopePosition, 'query should find a reverse-slope candidate');
  assert.ok((first.bestReverseSlopePosition?.position.x ?? 99) < 6.5, 'eastern threat should prefer the western reverse slope');
  assert.ok(first.bestHiddenRetreatPosition);
  assert.ok(first.exactCandidateCount <= 8);
  assert.ok(diagnosticsAfterFirst.exactRayCount <= 9, 'one current ray plus at most eight exact candidate rays are allowed');
  assert.ok(diagnosticsAfterFirst.roughCellCount < map.width * map.height, 'local query must not scan the whole map on this scenario');

  const second = queryDirectionalTerrainPositions(map, options);
  const diagnosticsAfterSecond = getDirectionalTerrainPositionQueryDiagnostics(map);
  assert.equal(second, first, 'same revisions and quantized origin must reuse the report object');
  assert.equal(diagnosticsAfterSecond.buildCount, diagnosticsAfterFirst.buildCount);
  assert.equal(diagnosticsAfterSecond.exactRayCount, diagnosticsAfterFirst.exactRayCount, 'cache hits must not cast new exact rays');
  assert.equal(diagnosticsAfterSecond.cacheHitCount, diagnosticsAfterFirst.cacheHitCount + 1);
}

function threat(id: string, x: number, y: number, confidence: number, uncertaintyCells: number) {
  return {
    id,
    x,
    y,
    radiusCells: 1,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    mode: 'area' as const,
    strength: 100,
    suppression: 80,
    confidence,
    uncertaintyCells,
  };
}

function directionalThreat(id: string, x: number, y: number) {
  return {
    id,
    labelRu: 'Пулемёт',
    x,
    y,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    mode: 'directional_fire' as const,
    strength: 100,
    suppression: 80,
    stressPerSecond: 20,
    directionDegrees: 180,
    arcDegrees: 360,
    rangeCells: 30,
    minRangeCells: 0,
    falloffPercent: 0,
    confidence: 100,
    uncertaintyCells: 0,
    source: 'seen' as const,
    visibleNow: true,
    lastSeenSeconds: 0,
    lastUpdatedSeconds: 0,
  };
}

function makeMap(width: number, height: number, heightAt: (x: number, y: number) => number): TacticalMapData {
  const cells: NonNullable<TacticalMapData['cells']> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({ x, y, terrain: 'field', height: heightAt(x, y), forest: 0 });
    }
  }
  return {
    width,
    height,
    cellSize: 24,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cells,
    objects: [],
  };
}
