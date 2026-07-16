import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BUILT_IN_MOVEMENT_PROFILE_IDS,
  MovementProfileImportError,
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
assert.equal(created.preferredGait, registry.requireProfile('stealth_move').preferredGait);
const copied = registry.copyProfile('quiet_patrol', 'quiet_patrol_copy', 'Quiet patrol copy', 'Тихий патруль — копия');
assert.equal(copied.templateProfileId, 'stealth_move');
registry.renameProfile('quiet_patrol_copy', 'Renamed movement', 'Переименованное движение');
assert.equal(registry.requireProfile('quiet_patrol_copy').nameRu, 'Переименованное движение');

const revisionBeforeSave = registry.revision;
const profileRevisionBeforeSave = registry.requireProfile('quiet_patrol').revision;
registry.updateProfile('quiet_patrol', {
  settings: {
    ...created.settings,
    speed: { ...created.settings.speed, speedMultiplier: 0.51 },
  },
});
assert.equal(registry.revision, revisionBeforeSave + 1, 'save must increment registry revision');
assert.equal(registry.requireProfile('quiet_patrol').revision, profileRevisionBeforeSave + 1, 'save must increment profile revision');

const reset = registry.resetProfile('quiet_patrol');
assert.equal(reset.settings.speed.speedMultiplier, getBuiltInMovementProfile('stealth_move').settings.speed.speedMultiplier);
assert.equal(registry.deleteProfile('quiet_patrol_copy'), true, 'custom profile can be deleted');

assert.equal(registry.findProfile('deleted_profile'), null, 'exact lookup must preserve a missing state');
assert.throws(() => registry.requireProfile('deleted_profile'), /Unknown movement profile/);
const fallbackResolution = registry.resolveProfile('deleted_profile');
assert.equal(fallbackResolution.resolvedId, 'normal_walk');
assert.equal(fallbackResolution.fallbackReason, 'missing-profile');
assert.equal(registry.resolveProfile(null).fallbackReason, 'empty-profile-id');

const migrated = MovementProfileRegistry.fromUnknown({
  formatVersion: 0,
  revision: 4,
  profiles: [{
    id: ' Legacy Profile ',
    nameRu: 'Старый профиль',
    nameEn: 'Legacy profile',
    preferredGait: 'run',
    fallbackProfileId: ' NORMAL_WALK ',
    settings: { speed: { speedMultiplier: 1.4 } },
  }],
});
assert.equal(migrated.requireProfile('legacy_profile').settings.speed.speedMultiplier, 1.4);
assert.equal(migrated.requireProfile('legacy_profile').fallbackProfileId, 'normal_walk');
assert.equal(
  migrated.requireProfile('legacy_profile').settings.weapon.allowFireWhileMoving,
  true,
  'missing fields receive safe defaults',
);

const beforeBrokenImport = registry.exportJson();
assert.throws(() => MovementProfileRegistry.importJson('{broken'), MovementProfileImportError);
let aggregateError: MovementProfileImportError | null = null;
try {
  MovementProfileRegistry.fromUnknown({
    formatVersion: 1,
    revision: 7,
    profiles: [
      { id: 'broken_one', preferredGait: 'teleport', settings: { speed: 'invalid' } },
      { id: 'broken_two', settings: { weapon: { allowFireWhileMoving: 'yes' } } },
    ],
  });
} catch (error) {
  if (error instanceof MovementProfileImportError) aggregateError = error;
  else throw error;
}
assert.ok(aggregateError, 'malformed import must return structured issues');
assert.ok(aggregateError.issues.length >= 3, 'all malformed profiles must be validated before rejection');
assert.ok(aggregateError.issues.some((issue) => issue.path === 'profiles[0].preferredGait'));
assert.ok(aggregateError.issues.some((issue) => issue.path === 'profiles[0].settings.speed'));
assert.ok(aggregateError.issues.some((issue) => issue.path === 'profiles[1].settings.weapon.allowFireWhileMoving'));
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
const sectionRegistrySource = await readFile(new URL('../src/ai-node-editor/AiEditorSectionRegistry.ts', import.meta.url), 'utf8');
const browserStorageSource = await readFile(new URL('../src/ai-node-editor/MovementProfileBrowserStorage.ts', import.meta.url), 'utf8');
const editorSource = `${viewSource}\n${schemaSource}\n${panelSource}`;

for (const label of ['Профили движения', 'Скорость и переходы', 'Выносливость', 'Визуальная заметность', 'Шум', 'Обзор во время движения', 'Оружие', 'Ограничения']) {
  assert.match(editorSource, new RegExp(label), `Russian UI label is missing: ${label}`);
}
assert.match(editorSource, /type="range"/);
assert.match(editorSource, /type="number"/);
assert.match(editorSource, /Сохранить изменения/);
assert.match(panelSource, /Есть несохранённые изменения/);
assert.match(panelSource, /Отменить изменения/);
assert.match(panelSource, /Остаться/);
assert.match(panelSource, /MovementProfileImportError/);
assert.match(panelSource, /disposeMovementProfileEditorPanel/);
assert.doesNotMatch(editorSource, /Технический id/);
assert.match(integrationSource, /registerAiEditorSection/);
assert.doesNotMatch(integrationSource, /querySelector|createElement|insertBefore/);
assert.match(sectionRegistrySource, /Профили маршрута/);
assert.match(sectionRegistrySource, /beforeLeave/);
assert.match(browserStorageSource, /localStorage/);
assert.match(browserStorageSource, /StorageEvent/);

for (const relativePath of [
  '../src/core/movement/MovementProfileTypes.ts',
  '../src/core/movement/MovementProfileDefaults.ts',
  '../src/core/movement/MovementProfileNormalization.ts',
  '../src/core/movement/MovementProfileImportValidation.ts',
  '../src/core/movement/MovementProfileRegistry.ts',
]) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bwindow\b|\blocalStorage\b|\bStorageEvent\b|\bStorage\b/,
    `movement core must remain browser-independent: ${relativePath}`);
}
await assert.rejects(
  access(path.join(process.cwd(), 'src', 'core', 'movement', 'MovementProfileStorage.ts')),
  /ENOENT/,
  'browser storage adapter must not remain under src/core',
);

console.log('Movement profiles smoke passed.');
