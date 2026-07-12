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

void main();

async function main(): Promise<void> {
  verifyStorageRoundTrip();
  verifySelectedPlayerProfileResolution();
  verifyMapIdentityIsolation();
  verifyProfileSwitchInvalidatesField();
  verifyHoverAndTextureCounters();
  await verifyRendererBoundary();
  console.log('Navigation overlay contract smoke passed: storage, map identity, typed-array hover, texture counters and renderer/A* separation.');
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
  assert.notEqual(fastCell.terrainCost, stealthCell.terrainCost, 'fast and stealth must have different terrain costs for the same cell');

  const diagnostics = getRouteCostFieldDiagnostics(cache);
  assert.equal(diagnostics.staticCostBuildCount, 2, 'switching between fast and stealth must rebuild both static fields');
}

function verifyHoverAndTextureCounters(): void {
  const registry = createDefaultNavigationProfileRegistry();
  const cache = createRouteCostFieldCache();
  const map = normalizeMap(makeMap([]));
  const fields = getRouteCostFields(map, registry.getProfile('stealth'), {
    unitId: 'unit-1',
    knowledgeRevision: 3,
    knownThreats: [],
  }, cache);
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

async function verifyRendererBoundary(): Promise<void> {
  const source = await readFile('src/rendering/PixiRouteCostOverlayRenderer.ts', 'utf8');
  assert.doesNotMatch(source, /GridPathfinder|findGridPath|runAStar/, 'renderer must not import or start A*');
  assert.match(source, /representation: 'two-raster-sprites'/);
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
