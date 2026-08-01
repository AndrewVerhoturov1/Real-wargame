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

const files = [
  'src/core/tuning/GameplayTuningProfiles.ts',
  'src/ui/GameplayTuningProfileStorage.ts',
  'src/ai-node-editor/GameplayTuningProfileEditor.ts',
  'src/ai-node-editor/GameplayTuningProfileEditorIntegration.ts',
  'src/ai-node-editor/gameplay-tuning-profile-editor.css',
  'scripts/gameplay_tuning_profiles_behavior_smoke.mjs',
  'scripts/gameplay_tuning_profiles_behavior_smoke.ts',
];
for (const file of files) expectFile(file);

expectIncludes('src/core/tuning/GameplayTuningProfiles.ts', [
  'GAMEPLAY_TUNING_FORMAT_VERSION = 1',
  'class GameplayTuningRegistry',
  'getGameplayTuningRegistry',
  'replaceGameplayTuningRegistry',
  'resolvePerceptionProfileSnapshot',
  'resolveSoldierArchetypeSnapshot',
  'resolveConditionProfileSnapshot',
  'Object.freeze',
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
  'color',
  'icon',
]);

expectIncludes('src/ui/GameplayTuningProfileStorage.ts', [
  'real-wargame.gameplay-tuning-profiles.v1',
  'loadGameplayTuningProfiles',
  'saveGameplayTuningProfiles',
  'subscribeGameplayTuningProfiles',
  'replaceGameplayTuningRegistry',
]);

expectIncludes('src/ai-node-editor/GameplayTuningProfileEditor.ts', [
  'profileId',
  'Создать копию',
  'Переименовать',
  'Сбросить',
  'Удалить',
  'Импорт',
  'Экспорт',
  'beforeClose',
]);
expectIncludes('src/ai-node-editor/GameplayTuningProfileEditorIntegration.ts', [
  'mountPerceptionProfileEditor',
  'mountSoldierArchetypeEditor',
  'mountConditionProfileEditor',
  'requestClose',
  'destroy()',
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
  'getActivePerceptionProfileSnapshot',
  'profile.contact.confidenceEvidenceDivisor',
  'profile.contact.evidenceDecayPerSecond',
  'profile.contact.uncertaintyGrowthMetersPerSecond',
]);
expectIncludes('src/core/units/UnitModel.ts', [
  'soldierArchetypeId?: string',
  'conditionProfileId?: string',
  'perceptionProfileId?: string',
  'resolveSoldierArchetypeSnapshot',
  'resolveConditionProfileSnapshot',
  'soldierArchetypeProfile:',
  'conditionProfile:',
]);
expectIncludes('src/core/combat/CombatDamage.ts', [
  'unit.conditionProfile.wound',
  'woundedMovementMultiplier',
  'severelyWoundedAimMultiplier',
  'limbHitStressGain',
]);
expectIncludes('src/core/combat/CombatSuppression.ts', [
  'unit.conditionProfile.suppression',
  'gainMultiplier',
  'decayPerSecond',
  'stressMultiplier',
]);

if (failures.length > 0) {
  console.error('Gameplay tuning editors smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

await import('./gameplay_tuning_profiles_behavior_smoke.mjs');
console.log('Gameplay tuning editors smoke passed.');
