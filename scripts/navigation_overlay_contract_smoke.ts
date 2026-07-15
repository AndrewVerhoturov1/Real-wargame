import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import {
  createDefaultNavigationProfileRegistry,
} from '../src/core/navigation/NavigationProfiles';
import { resolveActiveNavigationProfile } from '../src/core/navigation/NavigationProfileResolver';
import {
  loadNavigationProfileRegistry,
  NAVIGATION_PROFILE_STORAGE_KEY,
  saveNavigationProfileRegistry,
} from '../src/core/navigation/NavigationProfileStorage';
import {
  createRouteCostFieldCache,
  getRouteCostFieldDiagnostics,
  getRouteCostFields,
  markRouteCostTextureUploaded,
  readRouteCostCell,
} from '../src/core/navigation/RouteCostField';
import {
  getDirectionalTacticalField,
  getDirectionalTacticalFieldDiagnostics,
} from '../src/core/terrain/DirectionalTacticalField';

void main();

async function main(): Promise<void> {
  verifyStorageRoundTrip();
  verifySelectedPlayerProfileResolution();
  verifyMapIdentityIsolation();
  verifyProfileSwitchInvalidatesField();
  verifyHoverAndTextureCounters();
  verifySharedDirectionalFieldContentKey();
  await verifyRendererBoundary();
  console.log('Navigation overlay contract smoke passed: storage, map identity, typed-array hover, content-keyed shared terrain cache, hidden directional diagnostics, texture counters and renderer/A* separation.');
}

function verifySelectedPlayerProfileResolution(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const resolved = resolveActiveNavigationProfile(registry, {
    selectedPlayerProfileId: 'stealth',
    behaviorMovementMode: 'cautious',
    unitRoleProfileId: 'cautious',
  });
  assert.equal(resolved.profileId, 'stealth');
  assert.equal(resolved.source, 'playerSelection');
}

function verifyStorageRoundTrip(): void {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const registry = createDefaultNavigationProfileRegistry();
  registry.copyProfile('stealth', 'saved_scout', 'Saved scout', 'Сохранённый разведчик');
  saveNavigationProfileRegistry(registry, storage as Pick<Storage, 'setItem'>);
  assert.ok(values.get(NAVIGATION_PROFILE_STORAGE_KEY)?.includes('saved_scout'));
  const restored = loadNavigationProfileRegistry(storage as Pick<Storage, 'getItem'>);
  assert.equal(restored.getProfile('saved_scout').nameRu, 'Сохранённый разведчик');
}

function verifyMapIdentityIsolation(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const profile = registry.getProfile('normal');
  const cache = createRouteCostFieldCache();
  const left = normalizeMap(makeMap([{ x: 1, y: 1, terrain: 'road' }]));
  const right = normalizeMap(makeMap([{ x: 1, y: 1, terrain: 'swamp' }]));
  const leftFields = getRouteCostFields(left, profile, undefined, cache);
  const rightFields = getRouteCostFields(right, profile, undefined, cache);
  assert.notEqual(leftFields, rightFields, 'different map objects must not reuse one combined route-cost field');
  assert.notEqual(leftFields.terrainCost[7], rightFields.terrainCost[7]);
  const diagnostics = getRouteCostFieldDiagnostics(cache);
  assert.equal(diagnostics.staticCostBuildCount, 2);
  assert.equal(diagnostics.dynamicCostBuildCount, 2);
}

function verifyProfileSwitchInvalidatesField(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const cache = createRouteCostFieldCache();
  const map = normalizeMap(makeMap([{ x: 1, y: 1, terrain: 'field', forest: 1 }]));

  const fastProfile = registry.getProfile('fast');
  const stealthProfile = registry.getProfile('stealth');
  assert.equal(fastProfile.revision, stealthProfile.revision, 'built-in profiles share the same base revision');

  const fastFields = getRouteCostFields(map, fastProfile, undefined, cache);
  const stealthFields = getRouteCostFields(map, stealthProfile, undefined, cache);

  assert.notEqual(fastFields, stealthFields, 'fast and stealth fields must differ despite same profile revision');
  assert.notEqual(fastFields.cacheKey, stealthFields.cacheKey, 'fast and stealth must produce different cache keys');

  const cellX = 1;
  const cellY = 1;
  const fastCell = readRouteCostCell(fastFields, cellX, cellY, cache);
  const stealthCell = readRouteCostCell(stealthFields, cellX, cellY, cache);
  assert.ok(fastCell && stealthCell);
  assert.notEqual(fastCell?.terrainCost, stealthCell?.terrainCost, 'fast and stealth must have different terrain costs for the same cell');

  const diagnostics = getRouteCostFieldDiagnostics(cache);
  assert.equal(diagnostics.staticCostBuildCount, 2, 'switching between fast and stealth must rebuild both static fields');
}

function verifyHoverAndTextureCounters(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const cache = createRouteCostFieldCache();
  const map = normalizeMap(makeMap([]));
  const fields = getRouteCostFields(map, registry.getProfile('stealth'), {
    unitId: 'unit-1',
    originX: 1.5,
    originY: 1.5,
    knowledgeRevision: 3,
    knownThreats: [{
      id: 'east-threat',
      x: 5.5,
      y: 1.5,
      radiusCells: 1,
      widthCells: 0,
      heightCells: 0,
      rotationDegrees: 0,
      mode: 'area',
      strength: 100,
      suppression: 80,
      confidence: 90,
      uncertaintyCells: 0.5,
    }],
  }, cache);
  assert.equal(fields.availability.directionalTerrain, true);
  assert.equal(fields.threatSectorWeights.length, 8);
  const before = getRouteCostFieldDiagnostics(cache);
  readRouteCostCell(fields, 1, 1, cache);
  readRouteCostCell(fields, 2, 1, cache);
  markRouteCostTextureUploaded(cache);
  markRouteCostTextureUploaded(cache);
  const after = getRouteCostFieldDiagnostics(cache);
  assert.equal(after.hoverReadCount - before.hoverReadCount, 2);
  assert.equal(after.textureUploadCount - before.textureUploadCount, 2);
  assert.equal(after.staticCostBuildCount, before.staticCostBuildCount, 'hover must not rebuild static cost');
  assert.equal(after.dynamicCostBuildCount, before.dynamicCostBuildCount, 'hover must not rebuild dynamic cost');
}

function verifySharedDirectionalFieldContentKey(): void {
  const map = normalizeMap(makeMap([]));
  const threat = {
    id: 'stable-east-threat',
    x: 5.5,
    y: 1.5,
    strength: 100,
    suppression: 80,
    confidence: 90,
    uncertaintyCells: 0.5,
  };
  const first = getDirectionalTacticalField(map, {
    unitId: 'stable-unit',
    originX: 1.1,
    originY: 1.1,
    knowledgeRevision: 1,
    threats: [threat],
  });
  const afterFirst = getDirectionalTacticalFieldDiagnostics(map);

  const metadataOnly = getDirectionalTacticalField(map, {
    unitId: 'stable-unit',
    originX: 1.1,
    originY: 1.1,
    knowledgeRevision: 999,
    threats: [{
      ...threat,
      strength: 58,
      suppression: 41,
      confidence: 54,
    }],
  });
  const afterMetadataOnly = getDirectionalTacticalFieldDiagnostics(map);
  assert.equal(metadataOnly, first, 'metadata-only amplitude/revision changes must reuse the shared full-map field');
  assert.equal(afterMetadataOnly.buildCount, afterFirst.buildCount);
  assert.equal(afterMetadataOnly.fullMapScanCount, afterFirst.fullMapScanCount);
  assert.equal(afterMetadataOnly.cacheHitCount, afterFirst.cacheHitCount + 1);

  const moved = getDirectionalTacticalField(map, {
    unitId: 'stable-unit',
    originX: 1.4,
    originY: 1.4,
    knowledgeRevision: 1000,
    threats: [threat],
  });
  const afterMovement = getDirectionalTacticalFieldDiagnostics(map);
  assert.notEqual(moved, first, 'movement that changes normalized directional content must build a new field');
  assert.notEqual(moved.key, first.key, 'materially different normalized sector weights must have different content keys');
  assert.equal(afterMovement.buildCount, afterFirst.buildCount + 1);
  assert.equal(afterMovement.fullMapScanCount, afterFirst.fullMapScanCount + 1);

  const restored = getDirectionalTacticalField(map, {
    unitId: 'stable-unit',
    originX: 1.1,
    originY: 1.1,
    knowledgeRevision: 1001,
    threats: [{
      ...threat,
      strength: 72,
      suppression: 62,
      confidence: 67,
    }],
  });
  const afterRestore = getDirectionalTacticalFieldDiagnostics(map);
  assert.equal(restored, first, 'returning to the same normalized directional content must hit the retained LRU field');
  assert.equal(afterRestore.buildCount, afterMovement.buildCount);
  assert.equal(afterRestore.cacheHitCount, afterMovement.cacheHitCount + 1);
}

async function verifyRendererBoundary(): Promise<void> {
  const source = await readFile('src/rendering/PixiRouteCostOverlayRenderer.ts', 'utf8');
  const uiSource = await readFile('src/ui/RouteCostOverlayUi.ts', 'utf8');
  assert.doesNotMatch(source, /GridPathfinder|findGridPath|runAStar/, 'renderer must not import or start A*');
  assert.match(source, /representation: 'two-raster-sprites'/);
  assert.match(source, /directionalTerrainColor/);
  assert.match(source, /dynamicTextureKey = `\$\{fields\.cacheKey\}:\$\{dynamicMode\}`/);
  assert.match(source, /Направленный рельеф/);
  assert.doesNotMatch(uiSource, /option value="directionalTerrain"/, 'standalone directional terrain must stay an internal diagnostic, not a normal player layer');
  assert.match(uiSource, /учёт рельефа/);
  assert.match(source, /fontSize: 8/);
  assert.match(source, /strokeThickness: 2/);
  assert.match(source, /this\.legend\.resolution = ROUTE_TEXT_RESOLUTION/);
  assert.match(source, /this\.tooltip\.resolution = ROUTE_TEXT_RESOLUTION/);
  assert.match(source, /this\.container\.visible = false/);
  assert.match(source, /if \(!overlay\.active[\s\S]*this\.container\.visible = false[\s\S]*return;/);
  assert.doesNotMatch(
    source.match(/if \(!overlay\.active[\s\S]*?return;/)?.[0] ?? '',
    /destroy\(|removeChildren\(|createElement\('canvas'\)/,
    'disabling the layer must hide, not destroy or recreate resources',
  );
}

function makeMap(cells: TacticalMapData['cells']): TacticalMapData {
  return {
    width: 6,
    height: 4,
    cellSize: 24,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cells,
    objects: [],
  };
}
