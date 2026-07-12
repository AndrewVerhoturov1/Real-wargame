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
