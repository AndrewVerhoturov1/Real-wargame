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

function walkFiles(relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? walkFiles(relativePath) : [relativePath];
  });
}

for (const file of [
  'src/game-editors/createDefaultGameEditorRegistry.ts',
  'src/game-editors/GameEditorReturnTarget.ts',
  'src/combat-lab/game-editors/CombatLabGameEditors.ts',
  'src/combat-lab/game-editors/CombatLabGameEditorOverlay.ts',
  'src/combat-lab/game-editors/CombatLabGameEditorLinks.ts',
  'src/core/tuning/GameplayTuningProfiles.ts',
  'src/ui/GameplayTuningProfileStorage.ts',
  'scripts/gameplay_tuning_active_profiles_behavior_smoke.mjs',
]) expectFile(file);

const expectedIds = [
  'behaviorGraph',
  'tacticalPositions',
  'routeProfiles',
  'environmentProfiles',
  'movementProfiles',
  'weapons',
  'attentionProfiles',
  'perceptionProfiles',
  'soldierData',
  'soldierArchetypes',
  'conditionProfiles',
  'directionalTerrain',
];
const registrySource = read('src/game-editors/createDefaultGameEditorRegistry.ts');
for (const id of expectedIds) {
  const count = registrySource.split(`id: '${id}'`).length - 1;
  if (count !== 1) failures.push(`default registry: ${id} must be registered exactly once, found ${count}`);
}

expectIncludes('src/game-editors/createDefaultGameEditorRegistry.ts', [
  'getSafeGameEditorReturnTarget',
  'const safeReturnTo = getSafeGameEditorReturnTarget(request.returnTo)',
  "if (safeReturnTo) search.set('returnTo', safeReturnTo)",
  'mountPerceptionProfileEditor',
  'mountSoldierArchetypeEditor',
  'mountConditionProfileEditor',
]);
expectExcludes('src/game-editors/createDefaultGameEditorRegistry.ts', [
  "search.set('returnTo', request.returnTo)",
  "from '../combat-lab",
  "from '../../combat-lab",
]);

const combatLabMain = read('src/combat-lab/main.ts');
if (combatLabMain.split("import '../ui/GameplayTuningProfileStorage';").length - 1 !== 1) {
  failures.push('src/combat-lab/main.ts: GameplayTuningProfileStorage must be initialized exactly once');
}
expectIncludes('src/combat-lab/main.ts', [
  'CombatLabGameEditors.create',
  'workspaceHosts.settings',
  'gameEditorsInstallation?.destroy()',
  'quickParametersInstallation?.destroy()',
  './game-editors/combat-lab-game-editors.css',
]);

expectIncludes('src/combat-lab/game-editors/CombatLabGameEditorLinks.ts', [
  'unit.soldier.sourceProfileLinks ?? []',
  'Record<string, unknown>',
]);
expectExcludes('src/combat-lab/game-editors/CombatLabGameEditorLinks.ts', [
  'unit.soldier as unknown',
  'Record<string, any>',
]);

expectIncludes('src/combat-lab/game-editors/CombatLabGameEditorOverlay.ts', [
  'beforeClose:',
  'workspace.close()',
  'workspace.destroy()',
]);
expectExcludes('src/combat-lab/game-editors/CombatLabGameEditorOverlay.ts', [
  'setInterval(',
  'requestAnimationFrame(',
  'localStorage',
]);
expectExcludes('src/combat-lab/game-editors/CombatLabGameEditors.ts', [
  'setInterval(',
  'requestAnimationFrame(',
  'localStorage',
]);
expectExcludes('src/combat-lab/parameters/installCombatLabQuickParameters.ts', [
  'setInterval(',
  'requestAnimationFrame(',
  'localStorage',
]);

if (exists('src/core/tuning/GameplayTuningNumericRecords.d.ts')) {
  failures.push('src/core/tuning/GameplayTuningNumericRecords.d.ts: ambient type compatibility file must not exist');
}
expectIncludes('src/core/tuning/GameplayTuningProfiles.ts', [
  'function normalizePercentRecord<T extends object>',
  'Object.keys(fallback) as Array<keyof T>',
]);
expectIncludes('scripts/gameplay_tuning_active_profiles_behavior_smoke.ts', [
  'activeFallbackContact',
  'frozen soldier snapshot must ignore later active-profile changes',
]);

for (const sourceFile of walkFiles('src/core').filter((file) => /\.[cm]?[jt]sx?$/.test(file))) {
  const source = read(sourceFile);
  if (source.includes('localStorage')) failures.push(`${sourceFile}: core runtime must not access localStorage`);
}

const packageJson = JSON.parse(read('package.json'));
const requiredScripts = {
  'gameplay-tuning-editors:smoke': 'node scripts/gameplay_tuning_editors_smoke.mjs',
  'combat-lab-game-editors:smoke': 'node scripts/combat_lab_game_editors_smoke.mjs',
};
for (const [name, command] of Object.entries(requiredScripts)) {
  if (packageJson.scripts?.[name] !== command) failures.push(`package.json: ${name} must equal ${JSON.stringify(command)}`);
}
if (!String(packageJson.scripts?.['shared-game-editors:smoke'] ?? '').includes('shared_game_editors_integration_smoke.mjs')) {
  failures.push('package.json: shared-game-editors:smoke must run the compiler integration smoke');
}

for (const temporaryPath of [
  '.github/workflows/tmp-shared-game-editors-compiler.yml',
  'reports/.tmp-shared-game-editors-worker3-focused.txt',
  'reports/.tmp-shared-game-editors-trigger.txt',
]) {
  if (exists(temporaryPath)) failures.push(`${temporaryPath}: temporary compiler artifact must be removed`);
}

if (failures.length > 0) {
  console.error('Shared game editors compiler integration smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Shared game editors compiler integration smoke passed.');
