import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EnvironmentProfileRegistry,
  createDefaultEnvironmentProfileRegistry,
} from '../src/core/map/EnvironmentMaterialProfile';
import {
  ENVIRONMENT_PROFILE_STORAGE_KEY,
  loadEnvironmentProfileRegistry,
  saveEnvironmentProfileRegistry,
} from '../src/ui/EnvironmentProfileStorage';
import { normalizeMap } from '../src/core/map/MapModel';
import {
  buildAwarenessWorkerMapSnapshot,
  installAwarenessWorkerEnvironmentProfile,
  restoreAwarenessWorkerMap,
} from '../src/core/knowledge/AwarenessWorkerMapSnapshot';
import { getActiveEnvironmentProfile, installEnvironmentProfileRegistry } from '../src/core/map/EnvironmentProfileRuntime';
import { buildNavigationGrid, navigationCellAt } from '../src/core/pathfinding/GridNavigation';
import { getVisibilityGeometryField, readVisibilityGeometryCell } from '../src/core/visibility/VisibilityGeometryField';
import { createRouteCostFieldCache, getRouteCostFields } from '../src/core/navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../src/core/navigation/NavigationProfiles';

const registry = createDefaultEnvironmentProfileRegistry();
installEnvironmentProfileRegistry(registry);
const defaults = registry.getProfile();
assert.equal(defaults.vegetation.sparse_forest.nameRu, 'Редкий лес');
assert.equal(defaults.vegetation.dense_forest.presentation.coverage > defaults.vegetation.sparse_forest.presentation.coverage, true);
assert.equal(defaults.surfaces.water.movement.passable, false);


const layeredMap = normalizeMap({
  width: 4,
  height: 1,
  cellSize: 4,
  surfaceMaterialMap: [['field', 'swamp', 'swamp', 'water']],
  vegetationMaterialMap: [['dense_forest', 'none', 'dense_forest', 'none']],
});
const layeredGrid = buildNavigationGrid(layeredMap);
assert.equal(navigationCellAt(layeredGrid, 0, 0)?.movementCost, 1.45, 'dense vegetation must add resistance over field');
assert.equal(navigationCellAt(layeredGrid, 1, 0)?.movementCost, 1.8, 'swamp surface resistance must remain physical');
assert.equal(navigationCellAt(layeredGrid, 2, 0)?.movementCost, 2.25, 'surface and vegetation resistance must combine instead of replacing one another');
assert.equal(navigationCellAt(layeredGrid, 3, 0)?.passable, false, 'water material must remain impassable without a bridge');
const layeredRouteCosts = getRouteCostFields(
  layeredMap,
  getBuiltInNavigationProfile('normal'),
  undefined,
  createRouteCostFieldCache(),
);
assert.ok(Math.abs(layeredRouteCosts.terrainCost[0] - 1.45) < 1e-5, 'default profile must preserve canonical dense-forest physical cost');
assert.ok(Math.abs(layeredRouteCosts.terrainCost[1] - 1.8) < 1e-5, 'default profile must preserve canonical swamp physical cost');
assert.ok(Math.abs(layeredRouteCosts.terrainCost[2] - 2.25) < 1e-5, 'route cost must include both swamp and dense-forest physical resistance');


const customMaterialRegistry = EnvironmentProfileRegistry.fromUnknown({
  revision: 1,
  activeProfileId: 'default',
  profiles: [{
    id: 'default',
    vegetation: {
      reed_bed: {
        id: 'reed_bed',
        nameEn: 'Reed bed',
        nameRu: 'Камыш',
        legacyLayer: null,
        presentation: { textureId: 'procedural_forest_soft', colorTint: 0x526b38, opacity: 0.8, coverage: 0.65, textureScale: 1, noiseScale: 1, edgeSoftness: 0.3 },
        visibility: { transmissionLossPerMeter: 0.12, minimumTransmission: 0.03, targetConcealment: 45, localConcealment: 55 },
        fire: { transmissionLossPerMeter: 0.01, protectionPerMeter: 0.2, maximumProtection: 12, densityWeight: 0.35 },
        movement: { resistance: 1.35, tacticalConcealment: 0.4 },
      },
    },
  }],
});
installEnvironmentProfileRegistry(customMaterialRegistry);
const customMaterialMap = normalizeMap({
  width: 3,
  height: 1,
  cellSize: 4,
  vegetationMaterialMap: [['none', 'reed_bed', 'none']],
});
const customSnapshot = buildAwarenessWorkerMapSnapshot(customMaterialMap, 'custom-material-map', customMaterialRegistry.getProfile());
assert.ok(customSnapshot.vegetationMaterialIds.includes('reed_bed'), 'worker/static material transport must preserve non-legacy material IDs');
const customVisibilityMap = normalizeMap({
  width: 8,
  height: 3,
  cellSize: 4,
  metersPerCell: 2,
  vegetationMaterialMap: Array.from({ length: 3 }, (_, y) => Array.from({ length: 8 }, (_, x) => y === 1 && x >= 1 && x <= 6 ? 'reed_bed' : 'none')),
});
const customVisibility = getVisibilityGeometryField(customVisibilityMap, {
  origin: { x: 0.5, y: 1.5 },
  originHeightAboveGroundMeters: 1.7,
  targetHeightAboveGroundMeters: 1.7,
  rangeCells: 8,
  channel: 'visual',
});
assert.ok(readVisibilityGeometryCell(customVisibility, 7, 1).visualTransmission < 0.5, 'non-legacy vegetation materials must affect machine visibility through their profile values');
installEnvironmentProfileRegistry(registry);

const custom = registry.createCustomProfile('training_ground', 'Training ground', 'Учебный полигон');
const customBeforeRename = registry.getProfile(custom.id);
registry.updateVegetationMaterial(custom.id, 'sparse_forest', { nameRu: 'Редколесье' });
const customAfterRename = registry.getProfile(custom.id);
assert.equal(customAfterRename.vegetation.sparse_forest.nameRu, 'Редколесье');
assert.deepEqual(customAfterRename.revisions, customBeforeRename.revisions, 'renaming a material must not invalidate presentation or gameplay domains');
registry.updateVegetationMaterial(custom.id, 'sparse_forest', {
  presentation: { ...customAfterRename.vegetation.sparse_forest.presentation, coverage: 0.63 },
});
const roundTrip = EnvironmentProfileRegistry.importJson(registry.exportJson());
assert.equal(roundTrip.getProfile('training_ground').vegetation.sparse_forest.presentation.coverage, 0.63);

const clamped = EnvironmentProfileRegistry.fromUnknown({
  profiles: [{
    id: 'default',
    vegetation: { sparse_forest: { presentation: { coverage: 9, opacity: -2 } } },
  }],
});
assert.equal(clamped.getProfile().vegetation.sparse_forest.presentation.coverage, 1);
assert.equal(clamped.getProfile().vegetation.sparse_forest.presentation.opacity, 0);

const fallback = loadEnvironmentProfileRegistry({ getItem: () => '{broken-json' });
assert.equal(fallback.activeProfileId, 'default');

const storageValues = new Map<string, string>();
const storage = {
  getItem: (key: string): string | null => storageValues.get(key) ?? null,
  setItem: (key: string, value: string): void => { storageValues.set(key, value); },
};
const persistedRegistry = createDefaultEnvironmentProfileRegistry();
const persistedCustom = persistedRegistry.createCustomProfile('persisted_training', 'Persisted training', 'Сохранённый полигон');
persistedRegistry.updateSurfaceMaterial(persistedCustom.id, 'swamp', {
  movement: { ...persistedCustom.surfaces.swamp.movement, resistance: 2.4 },
});
saveEnvironmentProfileRegistry(persistedRegistry, storage);
assert.ok(storageValues.get(ENVIRONMENT_PROFILE_STORAGE_KEY)?.includes('persisted_training'));
const restoredRegistry = loadEnvironmentProfileRegistry(storage);
assert.equal(restoredRegistry.activeProfileId, persistedCustom.id);
assert.equal(restoredRegistry.getProfile(persistedCustom.id).surfaces.swamp.movement.resistance, 2.4);

const resetRegistry = createDefaultEnvironmentProfileRegistry();
const resetCustom = resetRegistry.createCustomProfile('resettable', 'Resettable', 'Сбрасываемый');
resetRegistry.updateVegetationMaterial(resetCustom.id, 'dense_forest', {
  fire: { ...resetCustom.vegetation.dense_forest.fire, maximumProtection: 12 },
});
assert.equal(resetRegistry.getProfile(resetCustom.id).vegetation.dense_forest.fire.maximumProtection, 12);
resetRegistry.resetProfile(resetCustom.id);
assert.equal(resetRegistry.getProfile(resetCustom.id).vegetation.dense_forest.fire.maximumProtection, defaults.vegetation.dense_forest.fire.maximumProtection, 'reset must restore built-in material values');
assert.equal(resetRegistry.deleteProfile(resetCustom.id), true);
assert.equal(resetRegistry.activeProfileId, 'default', 'deleting the active custom profile must restore the built-in default');
assert.equal(resetRegistry.deleteProfile('default'), false, 'the built-in default profile must not be deletable');


const workerRegistry = createDefaultEnvironmentProfileRegistry();
const workerCustom = workerRegistry.createCustomProfile('worker_profile', 'Worker profile', 'Профиль worker');
workerRegistry.updateVegetationMaterial(workerCustom.id, 'sparse_forest', {
  fire: { ...workerCustom.vegetation.sparse_forest.fire, protectionPerMeter: 3.25 },
});
const workerProfile = workerRegistry.getProfile(workerCustom.id);
const workerMap = normalizeMap({
  width: 2, height: 1, cellSize: 4.8, environmentProfileId: workerProfile.id,
  surfaceMaterialMap: [['road', 'field']],
  vegetationMaterialMap: [['sparse_forest', 'dense_forest']],
});
const workerSnapshot = buildAwarenessWorkerMapSnapshot(workerMap, 'worker-map', workerProfile);
installAwarenessWorkerEnvironmentProfile(workerSnapshot);
const restoredWorkerMap = restoreAwarenessWorkerMap(workerSnapshot);
assert.equal(getActiveEnvironmentProfile().id, workerProfile.id);
assert.equal(getActiveEnvironmentProfile().vegetation.sparse_forest.fire.protectionPerMeter, 3.25);
assert.deepEqual(restoredWorkerMap.cells.map((cell) => [cell.surfaceMaterialId, cell.vegetationMaterialId]), [
  ['road', 'sparse_forest'], ['field', 'dense_forest'],
]);
assert.equal(workerSnapshot.surfaceMaterialCodes.byteLength + workerSnapshot.vegetationMaterialCodes.byteLength, 8);

const materialCoreSource = readFileSync('src/core/map/EnvironmentMaterialProfile.ts', 'utf8');
const materialRuntimeSource = readFileSync('src/core/map/EnvironmentProfileRuntime.ts', 'utf8');
const storageAdapterSource = readFileSync('src/ui/EnvironmentProfileStorage.ts', 'utf8');
for (const coreSource of [materialCoreSource, materialRuntimeSource]) {
  assert.doesNotMatch(coreSource, /\bwindow\b|\blocalStorage\b|\bStorage\b/, 'environment-profile core must remain browser-independent');
}
assert.match(storageAdapterSource, /window\.localStorage/, 'browser persistence must live in the UI adapter');
assert.equal(materialRuntimeSource.includes('EnvironmentProfileStorage'), false, 'core runtime must not depend on the browser storage adapter');

const sectionRegistrySource = readFileSync('src/ai-node-editor/AiEditorSectionRegistry.ts', 'utf8');
const environmentIntegrationSource = readFileSync('src/ai-node-editor/EnvironmentProfileEditorIntegration.ts', 'utf8');
const movementIntegrationSource = readFileSync('src/ai-node-editor/MovementProfileEditorIntegration.ts', 'utf8');
const panelSource = readFileSync('src/ai-node-editor/EnvironmentProfileEditorPanel.ts', 'utf8');
const mainSource = readFileSync('src/main.ts', 'utf8');
assert.match(mainSource, /requestedInitialEnvironmentProfileId[\s\S]*hasProfile\(requestedInitialEnvironmentProfileId\)/, 'an explicit map profile ID must be activated when its registry entry exists');
assert.match(environmentIntegrationSource, /labelRu:\s*'Профили местности'/, 'environment editor must register through the shared section registry');
assert.match(environmentIntegrationSource, /order:\s*25/, 'environment editor must sit between route and movement profiles');
assert.match(movementIntegrationSource, /order:\s*30/, 'movement editor must follow environment profiles');
assert.match(sectionRegistrySource, /\['profiles',\s*'Профили маршрута',\s*20\]/, 'the legacy profiles tab must be labelled as route profiles');
assert.match(sectionRegistrySource, /\['attentionProfiles',\s*'Профили внимания',\s*40\]/);
assert.match(sectionRegistrySource, /\['blackboard',\s*'Данные бойца',\s*50\]/);
for (const label of ['Покрытие', 'Потеря обзора', 'Ослабление огня', 'Сопротивление движению', 'Импорт', 'Экспорт']) assert.match(panelSource, new RegExp(label));
assert.doesNotMatch(panelSource, /Технический id|Новое английское название/, 'normal profile operations must not require technical identifiers or English metadata');
assert.match(panelSource, /textField\('nameRu', 'Название'/, 'material names must be editable in Russian without exposing technical IDs');
assert.match(panelSource, /selectField\('presentation\.textureId'/, 'texture choice must be a user-facing selector, not a raw technical-id input');
const hudSource = readFileSync('src/ui/GameHudControls.ts', 'utf8');
const workspaceSource = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
const pixiAppSource = readFileSync('src/rendering/PixiApp.ts', 'utf8');
assert.match(hudSource, /getVegetationMaterial\(getActiveEnvironmentProfile\(\), cell\.vegetationMaterialId\)/, 'HUD must display canonical vegetation material names');
assert.match(workspaceSource, /getVegetationMaterial\(profile,cell\.vegetationMaterialId\)/, 'workspace must display canonical vegetation material names');
assert.match(pixiAppSource, /getVegetationMaterial\(environment, cell\.vegetationMaterialId\)/, 'Pixi hover diagnostics must display canonical vegetation material names');
assert.doesNotMatch(pixiAppSource, /formatForestLayer\(cell\.forest/, 'Pixi hover diagnostics must not fall back to legacy forest codes');
console.log('environment-materials: smoke passed');
