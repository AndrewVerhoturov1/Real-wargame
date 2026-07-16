import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EnvironmentProfileRegistry,
  createDefaultEnvironmentProfileRegistry,
} from '../src/core/map/EnvironmentMaterialProfile';
import { loadEnvironmentProfileRegistry } from '../src/core/map/EnvironmentProfileStorage';
import { normalizeMap } from '../src/core/map/MapModel';
import {
  buildAwarenessWorkerMapSnapshot,
  installAwarenessWorkerEnvironmentProfile,
  restoreAwarenessWorkerMap,
} from '../src/core/knowledge/AwarenessWorkerMapSnapshot';
import { getActiveEnvironmentProfile } from '../src/core/map/EnvironmentProfileRuntime';

const registry = createDefaultEnvironmentProfileRegistry();
const defaults = registry.getProfile();
assert.equal(defaults.vegetation.sparse_forest.nameRu, 'Редкий лес');
assert.equal(defaults.vegetation.dense_forest.presentation.coverage > defaults.vegetation.sparse_forest.presentation.coverage, true);
assert.equal(defaults.surfaces.water.movement.passable, false);

const custom = registry.createCustomProfile('training_ground', 'Training ground', 'Учебный полигон');
registry.updateVegetationMaterial(custom.id, 'sparse_forest', {
  presentation: { ...custom.vegetation.sparse_forest.presentation, coverage: 0.63 },
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

const uiSource = readFileSync('src/ai-node-editor/NavigationProfileEditor.ts', 'utf8');
const panelSource = readFileSync('src/ai-node-editor/EnvironmentProfileEditorPanel.ts', 'utf8');
assert.match(uiSource, /Профили местности/);
for (const label of ['Покрытие', 'Потеря обзора', 'Ослабление огня', 'Сопротивление движению', 'Импорт', 'Экспорт']) assert.match(panelSource, new RegExp(label));
console.log('environment-materials: smoke passed');
