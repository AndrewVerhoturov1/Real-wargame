import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BUILT_IN_MOVEMENT_PROFILE_IDS,
  MovementProfileRegistry,
  createDefaultMovementProfileRegistry,
  getBuiltInMovementProfile,
} from '../src/core/movement/MovementProfiles';
import { resolveMovementProfileSelection } from '../src/ai-node-editor/MovementProfileSelector';

const registry = createDefaultMovementProfileRegistry();
assert.deepEqual(
  registry.listProfiles().slice(0, BUILT_IN_MOVEMENT_PROFILE_IDS.length).map((profile) => profile.id),
  [...BUILT_IN_MOVEMENT_PROFILE_IDS],
  'built-in movement profiles must keep stable order',
);
assert.equal(registry.deleteProfile('normal_walk'), false, 'built-in profiles cannot be deleted');

const created = registry.createCustomProfile('quiet_patrol', 'Quiet patrol', 'Тихий патруль', 'stealth_move');
assert.equal(created.builtIn, false);
assert.equal(created.preferredGait, registry.getProfile('stealth_move').preferredGait);
const copied = registry.copyProfile('quiet_patrol', 'quiet_patrol_copy', 'Quiet patrol copy', 'Тихий патруль — копия');
assert.equal(copied.templateProfileId, 'stealth_move');
registry.renameProfile('quiet_patrol_copy', 'Renamed movement', 'Переименованное движение');
assert.equal(registry.getProfile('quiet_patrol_copy').nameRu, 'Переименованное движение');

const revisionBeforeSave = registry.revision;
const profileRevisionBeforeSave = registry.getProfile('quiet_patrol').revision;
registry.updateProfile('quiet_patrol', {
  settings: {
    ...created.settings,
    speed: { ...created.settings.speed, speedMultiplier: 0.51 },
  },
});
assert.equal(registry.revision, revisionBeforeSave + 1, 'save must increment registry revision');
assert.equal(registry.getProfile('quiet_patrol').revision, profileRevisionBeforeSave + 1, 'save must increment profile revision');

const reset = registry.resetProfile('quiet_patrol');
assert.equal(reset.settings.speed.speedMultiplier, getBuiltInMovementProfile('stealth_move').settings.speed.speedMultiplier);
assert.equal(registry.deleteProfile('quiet_patrol_copy'), true, 'custom profile can be deleted');

const migrated = MovementProfileRegistry.fromUnknown({
  formatVersion: 0,
  revision: 4,
  profiles: [{
    id: 'legacy_profile',
    nameRu: 'Старый профиль',
    nameEn: 'Legacy profile',
    preferredGait: 'run',
    settings: { speed: { speedMultiplier: 1.4 } },
  }],
});
assert.equal(migrated.getProfile('legacy_profile').settings.speed.speedMultiplier, 1.4);
assert.equal(migrated.getProfile('legacy_profile').settings.weapon.allowFireWhileMoving, true, 'missing fields receive safe defaults');

const beforeBrokenImport = registry.exportJson();
assert.throws(() => MovementProfileRegistry.importJson('{broken'), /valid JSON/);
assert.equal(registry.exportJson(), beforeBrokenImport, 'failed import must not mutate the current registry');

const restored = MovementProfileRegistry.importJson(registry.exportJson());
assert.deepEqual(restored.toData(), registry.toData(), 'export/import must preserve every movement parameter');

const missingSelection = resolveMovementProfileSelection(restored, 'deleted_profile');
assert.equal(missingSelection.missing, true);
assert.equal(missingSelection.resolvedId, null, 'deleted selection must not silently choose another profile');

const viewSource = await readFile(new URL('../src/ai-node-editor/MovementProfileEditorView.ts', import.meta.url), 'utf8');
const schemaSource = await readFile(new URL('../src/ai-node-editor/MovementProfileEditorSchema.ts', import.meta.url), 'utf8');
const panelSource = await readFile(new URL('../src/ai-node-editor/MovementProfileEditorPanel.ts', import.meta.url), 'utf8');
const integrationSource = await readFile(new URL('../src/ai-node-editor/MovementProfileEditorIntegration.ts', import.meta.url), 'utf8');
const editorSource = `${viewSource}\n${schemaSource}\n${panelSource}`;
for (const label of ['Профили движения', 'Скорость и переходы', 'Выносливость', 'Визуальная заметность', 'Шум', 'Обзор во время движения', 'Оружие', 'Ограничения']) {
  assert.match(editorSource, new RegExp(label), `Russian UI label is missing: ${label}`);
}
assert.match(editorSource, /type="range"/);
assert.match(editorSource, /type="number"/);
assert.match(editorSource, /Сохранить изменения/);
assert.match(panelSource, /disposeMovementProfileEditorPanel/);
assert.doesNotMatch(editorSource, /Технический id/);
assert.match(integrationSource, /Профили маршрута/);
assert.match(integrationSource, /Профили движения/);

console.log('Movement profiles smoke passed.');
