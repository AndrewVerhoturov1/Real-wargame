import assert from 'node:assert/strict';
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
import {
  getDirectionalTerrainStaticGrid,
  sampleDirectionalSlope,
} from '../src/core/terrain/DirectionalTerrainStaticGrid';
import {
  buildThreatDirectionField,
  threatSectorBearingRadians,
} from '../src/core/terrain/ThreatDirectionField';

verifyStaticSlopeDirectionAndCache();
verifyThreatSectorsAndUncertainty();
verifyProfileMigration();
verifyDirectionalRouteCostsAndCacheSeparation();

console.log('Directional terrain smoke passed: cached terrain derivatives, eight-sector subjective threats, profile migration and route-cost integration.');

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

function verifyDirectionalRouteCostsAndCacheSeparation(): void {
  const map = normalizeMap(makeMap(9, 5, (x) => [0, 1, 2, 3, 4, 3, 2, 1, 0][x]));
  const registry = createDefaultNavigationProfileRegistry();
  const cache = createRouteCostFieldCache();
  const context = {
    unitId: 'directional-soldier',
    originX: 4.5,
    originY: 2.5,
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
