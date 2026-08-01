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

const requiredFiles = [
  'src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts',
  'src/combat-lab/game-editors/CombatLabGameEditorOverlay.ts',
  'src/combat-lab/game-editors/CombatLabGameEditorLinks.ts',
  'src/combat-lab/game-editors/CombatLabGameEditors.ts',
  'src/combat-lab/game-editors/combat-lab-game-editors.css',
  'src/game-editors/GameEditorReturnTarget.ts',
];
for (const file of requiredFiles) expectFile(file);

expectIncludes('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', [
  "{ tabId: 'settings', labelRu: 'Настройка игры', titleRu: 'Настройка игры' }",
  'readonly settings: HTMLElement',
]);

expectIncludes('src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts', [
  "registry.listForSurface('combat-lab')",
  'GROUP_LABEL_RU',
  'definition.activationFor',
  'definition.id',
]);
expectExcludes('src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts', [
  "'behaviorGraph', 'routeProfiles'",
  "'perceptionProfiles'",
  "'soldierArchetypes'",
  "'conditionProfiles'",
  'setInterval(',
  'requestAnimationFrame(',
]);

expectIncludes('src/combat-lab/game-editors/CombatLabGameEditorOverlay.ts', [
  'new GameEditorWorkspace',
  "'combat-lab'",
  'beforeClose:',
  'workspace.close()',
  'this.workspace?.destroy()',
  'getSafeGameEditorReturnTarget',
]);
expectExcludes('src/combat-lab/game-editors/CombatLabGameEditorOverlay.ts', [
  'new CombatLabExperimentDraft',
  'new CombatLabBatchClient',
  'CombatLabExperimentVisualController.create',
  'new PIXI.Application',
]);

expectIncludes('src/combat-lab/game-editors/combat-lab-game-editors.css', [
  '.combat-lab-game-editor-workbench-close',
  '.combat-lab-game-editor-workbench-content',
  'overflow: auto',
  '@media (max-width: 1100px), (max-height: 760px)',
  'width: calc(100vw - 24px)',
  'height: calc(100vh - 24px)',
]);

expectIncludes('src/game-editors/GameEditorReturnTarget.ts', [
  'getSafeGameEditorReturnTarget',
  "'/combat-lab.html'",
  "value.startsWith('//')",
  "value.includes('\\\\')",
]);

expectIncludes('src/game-editors/createDefaultGameEditorRegistry.ts', [
  'getSafeGameEditorReturnTarget',
  'const safeReturnTo = getSafeGameEditorReturnTarget(request.returnTo)',
]);
expectExcludes('src/game-editors/createDefaultGameEditorRegistry.ts', [
  "search.set('returnTo', request.returnTo)",
]);

expectIncludes('src/ai-node-editor/AiEditorGameEditorPlatform.ts', [
  'getSafeGameEditorReturnTarget',
  'Вернуться в полигон',
  'data-game-editor-return',
]);

expectIncludes('src/combat-lab/main.ts', [
  'CombatLabGameEditors',
  'workspaceHosts.settings',
  'gameEditorsInstallation?.destroy()',
  './game-editors/combat-lab-game-editors.css',
]);

expectIncludes('src/combat-lab/CombatLabExtension.ts', [
  'parametersHost: this.layout.parametersPanelHost,',
]);

expectIncludes('src/combat-lab/parameters/installCombatLabQuickParameters.ts', [
  'sourceProfilesHost',
  'resolveCombatLabSelectedUnitProfileLinks',
  'onOpenSourceProfile',
  'requestCombatLabGameEditorOpen',
  'не указан — редактор откроет текущий профиль',
  '...(link.profileId ? { profileId: link.profileId } : {})',
  "const installationRoot = document.createElement('section');",
  "installationRoot.className = 'combat-lab-quick-parameters-installation';",
  'installationRoot.append(sourceProfilesHost, quickParametersHost);',
  'host.insertBefore(installationRoot, manualDivider);',
  'installationRoot.remove();',
  'unsubscribeSelection()',
  'unsubscribeDraft()',
]);
expectExcludes('src/combat-lab/parameters/installCombatLabQuickParameters.ts', [
  'host.replaceChildren(sourceProfilesHost, quickParametersHost);',
  'host.replaceChildren();',
  'setInterval(',
  'requestAnimationFrame(',
  'localStorage',
]);

if (failures.length > 0) {
  console.error('Combat Lab game-editor integration smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

await import('./combat_lab_game_editors_behavior_smoke.mjs');
console.log('Combat Lab game-editor integration smoke passed.');
