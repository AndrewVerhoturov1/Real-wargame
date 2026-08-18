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

function expectDefaultRegistryInventory() {
  const relativePath = 'src/game-editors/createDefaultGameEditorRegistry.ts';
  if (!exists(relativePath)) {
    failures.push(`${relativePath}: file is missing`);
    return;
  }
  const source = read(relativePath);
  const ids = [...source.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
  const expected = [
    'behaviorGraph',
    'routeProfiles',
    'tacticalPositions',
    'soldierData',
    'soldierArchetypes',
    'attentionProfiles',
    'perceptionProfiles',
    'movementProfiles',
    'weapons',
    'conditionProfiles',
    'environmentProfiles',
    'directionalTerrain',
  ];
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    failures.push(`${relativePath}: registry inventory changed: ${JSON.stringify(ids)}`);
  }
}

const requiredFiles = [
  'src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts',
  'src/combat-lab/game-editors/CombatLabGameEditorOverlay.ts',
  'src/combat-lab/game-editors/CombatLabGameEditorLinks.ts',
  'src/combat-lab/game-editors/CombatLabGameEditors.ts',
  'src/combat-lab/game-editors/CombatLabEditorShellBridge.ts',
  'src/combat-lab/game-editors/combat-lab-game-editors.css',
  'src/combat-lab/game-editors/combat-lab-game-editor-shell.css',
  'src/game-editors/GameEditorReturnTarget.ts',
];
for (const file of requiredFiles) expectFile(file);

expectIncludes('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', [
  "{ tabId: 'settings', labelRu: 'Общие редакторы', titleRu: 'Общие редакторы игры' }",
  'readonly settings: HTMLElement',
]);

expectDefaultRegistryInventory();

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

expectIncludes('src/combat-lab/game-editors/CombatLabEditorShellBridge.ts', [
  "const PRESENTED_LEFT_TABS = new Set<CombatLabWorkspaceTab>(['scene', 'parameters'])",
  "const EDITOR_PANEL_TABS = ['scene', 'parameters', 'settings'] as const",
  "'#combat-lab-workspace-panel-scene'",
  "'#combat-lab-workspace-panel-parameters'",
  "'#combat-lab-workspace-panel-settings'",
  "'combat-lab:activate-tab'",
  "new URLSearchParams(search).get('tab') === 'settings'",
  "this.presentPanel('settings', this.portalBody)",
  'this.hiddenHosts.append(panel)',
]);
expectExcludes('src/combat-lab/game-editors/CombatLabEditorShellBridge.ts', [
  'new GameEditorRegistry',
  'createDefaultGameEditorRegistry',
  'new CombatLabExperimentDraft',
  'localStorage',
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

expectIncludes('src/combat-lab/game-editors/combat-lab-game-editor-shell.css', [
  '.polygon-shell-editor-tab-host',
  '.polygon-shell-editors-portal',
  '.polygon-shell-editors-return',
  '.polygon-shell-top-button--editors[aria-pressed="true"]',
  '.combat-lab-game-editor-workbench-header',
  '@media (max-width: 1180px)',
  '@media (max-width: 760px)',
  'overflow: auto',
]);

expectIncludes('src/combat-lab/game-editors/PolygonGlobalEditorParity.ts', [
  "'Как будет вести себя боец'",
  "'Встроенные'",
  "'Мои профили'",
  'polygonRouteDetourPercent',
  "'ge-route-scroll'",
  "'ge-profile-meta-grid'",
  'decorateRouteProfileSubtabs',
  'routeSubtabIntro',
  'ge-route-future',
  'ge-route-limit',
  'tabSurfaces.forEach((surface) => { surface.hidden = true; });',
]);

expectIncludes('src/combat-lab/game-editors/polygon-global-editor-feature-grid.css', [
  '.polygon-route-profile-editor .ge-route-main',
  '.polygon-route-profile-editor .ge-detour-control',
  '.polygon-route-profile-editor .ge-profile-meta-grid',
  '.polygon-route-profile-editor .ge-field-card',
  '.polygon-route-profile-editor .ge-route-future',
  '.polygon-route-profile-editor .ge-route-limit',
  'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif !important;',
  'font: inherit !important;',
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
  'CombatLabEditorShellBridge.create',
  'editorShellBridge?.destroy()',
  'gameEditorsInstallation?.destroy()',
  './game-editors/combat-lab-game-editors.css',
  './game-editors/combat-lab-game-editor-shell.css',
]);

expectIncludes('src/combat-lab/CombatLabExtension.ts', [
  'parametersHost: this.layout.parametersPanelHost,',
  'hosts.scene.append(templatePanel, validationHost, scenePanelHost);',
  'hosts.parameters.append(',
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
