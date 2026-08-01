import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

function expectFile(relativePath) {
  if (!exists(relativePath)) failures.push(`${relativePath}: file is missing`);
}

function expectIncludes(relativePath, snippets) {
  if (!exists(relativePath)) {
    failures.push(`${relativePath}: file is missing`);
    return;
  }
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
  }
}

function expectExcludes(relativePath, snippets) {
  if (!exists(relativePath)) return;
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (source.includes(snippet)) failures.push(`${relativePath}: forbidden ${JSON.stringify(snippet)}`);
  }
}

for (const file of [
  'src/core/tuning/GameplayTuningProfiles.ts',
  'src/core/tuning/GameplayTuningRuntime.ts',
  'src/ui/GameplayTuningProfileStorage.ts',
  'src/ai-node-editor/GameplayTuningProfileEditor.ts',
  'src/ai-node-editor/GameplayTuningProfileEditorIntegration.ts',
  'src/ai-node-editor/gameplay-tuning-profile-editor.css',
  'scripts/gameplay_tuning_profiles_behavior_smoke.mjs',
  'scripts/gameplay_tuning_profiles_behavior_smoke.ts',
  'scripts/gameplay_tuning_active_profiles_behavior_smoke.mjs',
  'scripts/gameplay_tuning_active_profiles_behavior_smoke.ts',
]) expectFile(file);

if (exists('src/core/tuning/GameplayTuningNumericRecords.d.ts')) {
  failures.push('src/core/tuning/GameplayTuningNumericRecords.d.ts: ambient compatibility hack must be removed');
}

expectIncludes('src/core/tuning/GameplayTuningProfiles.ts', [
  'GAMEPLAY_TUNING_FORMAT_VERSION = 1',
  'class GameplayTuningRegistry',
  'getGameplayTuningRegistry',
  'replaceGameplayTuningRegistry',
  'resolvePerceptionProfileSnapshot',
  'resolveSoldierArchetypeSnapshot',
  'resolveConditionProfileSnapshot',
  'function normalizePercentRecord<T extends object>',
  'Object.keys(fallback) as Array<keyof T>',
  'semanticRevision',
]);
expectExcludes('src/core/tuning/GameplayTuningProfiles.ts', [
  'localStorage',
  'sessionStorage',
  'document.',
  'window.',
  'HTMLElement',
  'setInterval(',
  'requestAnimationFrame(',
]);

expectIncludes('src/core/tuning/GameplayTuningRuntime.ts', [
  'getActiveConditionProfileSnapshot',
  'setActiveConditionProfileId',
  'restoreActiveConditionProfileId',
]);
expectExcludes('src/core/tuning/GameplayTuningRuntime.ts', ['localStorage', 'document.', 'window.']);

expectIncludes('src/ui/GameplayTuningProfileStorage.ts', [
  'real-wargame.gameplay-tuning-profiles.v1',
  'loadGameplayTuningProfiles',
  'saveGameplayTuningProfiles',
  'subscribeGameplayTuningProfiles',
  'replaceGameplayTuningRegistry',
  'installSoldierArchetypeResolver',
  'installSoldierProfileSnapshotResolver',
]);
expectExcludes('src/ui/GameplayTuningProfileStorage.ts', ['setInterval(', 'requestAnimationFrame(']);

expectIncludes('src/ai-node-editor/GameplayTuningProfileEditor.ts', [
  'context.request.profileId',
  'Создать копию',
  'Переименовать',
  'Сбросить реестр',
  'Удалить',
  'Импорт',
  'Экспорт',
  'Сделать активным',
  'beforeClose',
]);
expectExcludes('src/ai-node-editor/GameplayTuningProfileEditor.ts', [
  'setInterval(',
  'requestAnimationFrame(',
  "querySelector('#",
]);

expectIncludes('src/ai-node-editor/GameplayTuningProfileEditorIntegration.ts', [
  'mountPerceptionProfileEditor',
  'mountSoldierArchetypeEditor',
  'mountConditionProfileEditor',
  'beforeClose:',
  'editor.destroy()',
]);

const registrySource = read('src/game-editors/createDefaultGameEditorRegistry.ts');
for (const id of ['perceptionProfiles', 'soldierArchetypes', 'conditionProfiles']) {
  const count = registrySource.split(`id: '${id}'`).length - 1;
  if (count !== 1) failures.push(`default registry: ${id} must be defined exactly once, found ${count}`);
}
expectIncludes('src/game-editors/createDefaultGameEditorRegistry.ts', [
  'mountPerceptionProfileEditor',
  'mountSoldierArchetypeEditor',
  'mountConditionProfileEditor',
]);

expectIncludes('src/core/perception/PerceptionContact.ts', [
  'input.perceptionProfile ?? getActivePerceptionProfileSnapshot()',
  'profile.contact.confidenceEvidenceDivisor',
  'profile.contact.evidenceDecayPerSecond',
  'profile.contact.uncertaintyGrowthMetersPerSecond',
]);
expectIncludes('src/core/behavior/BehaviorModel.ts', [
  'SoldierArchetypeResolver',
  'installSoldierArchetypeResolver',
  'installSoldierProfileSnapshotResolver',
  'soldierArchetypeResolver?.(requestedArchetypeId)',
  'sourceProfileLinks',
]);
expectIncludes('src/core/combat/CombatDamage.ts', [
  'unit.soldier.conditionProfile ?? getActiveConditionProfileSnapshot()',
  'conditionProfile.wound.limbHitStressGain',
  'woundedMovementMultiplier',
  'severelyWoundedAimMultiplier',
]);
expectIncludes('src/core/combat/CombatSuppression.ts', [
  'unit.soldier.conditionProfile ?? getActiveConditionProfileSnapshot()',
  'suppressionProfile.gainMultiplier',
  'suppressionProfile.decayPerSecond',
  'suppressionProfile.stressMultiplier',
  'suppressionProfile.maximumSuppression',
]);

expectIncludes('src/combat-lab/game-editors/CombatLabGameEditorLinks.ts', [
  'unit.soldier.sourceProfileLinks ?? []',
  'Record<string, unknown>',
]);
expectExcludes('src/combat-lab/game-editors/CombatLabGameEditorLinks.ts', [
  'unit.soldier as unknown',
  'Record<string, any>',
]);

if (failures.length > 0) {
  console.error('Gameplay tuning editors smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

await import('./gameplay_tuning_profiles_behavior_smoke.mjs');
await import('./gameplay_tuning_active_profiles_behavior_smoke.mjs');
console.log('Gameplay tuning editors smoke passed.');
