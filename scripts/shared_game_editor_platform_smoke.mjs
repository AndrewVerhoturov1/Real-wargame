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
  const content = read(relativePath);
  for (const snippet of snippets) {
    if (!content.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
  }
}

function expectExcludes(relativePath, snippets) {
  if (!exists(relativePath)) return;
  const content = read(relativePath);
  for (const snippet of snippets) {
    if (content.includes(snippet)) failures.push(`${relativePath}: forbidden ${JSON.stringify(snippet)}`);
  }
}

function walkFiles(relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? walkFiles(relativePath) : [relativePath];
  });
}

const platformFiles = [
  'src/game-editors/GameEditorTypes.ts',
  'src/game-editors/GameEditorRegistry.ts',
  'src/game-editors/GameEditorWorkspace.ts',
  'src/game-editors/createDefaultGameEditorRegistry.ts',
  'src/game-editors/game-editor-workspace.css',
  'src/ai-node-editor/AiEditorGameEditorPlatform.ts',
];
for (const file of platformFiles) expectFile(file);

expectIncludes('src/game-editors/GameEditorTypes.ts', [
  "export type GameEditorSurface = 'ai-editor' | 'combat-lab'",
  "export type GameEditorActivation = 'embedded' | 'route' | 'hidden'",
  'readonly host: HTMLElement',
  'readonly profileId?: string',
  'readonly selectedUnitId?: string',
  'beforeClose?(): boolean | Promise<boolean>',
  'destroy(): void',
]);

expectIncludes('src/game-editors/GameEditorRegistry.ts', [
  'class GameEditorRegistry',
  'Game editor id is required',
  'Game editor id is already registered',
  'Game editor label is required',
  'Embedded editor has no mount function',
  'Route editor has no route factory',
  'GROUP_ORDER',
  'GROUP_LABEL_RU',
  'Object.freeze',
]);
expectExcludes('src/game-editors/GameEditorRegistry.ts', ['document.', 'window.', 'querySelector', 'localStorage']);

expectIncludes('src/game-editors/GameEditorWorkspace.ts', [
  'beforeClose',
  'installation.destroy()',
  'transitionRevision',
  'isCurrentTransition',
  'host.replaceChildren()',
]);
expectExcludes('src/game-editors/GameEditorWorkspace.ts', [
  'setInterval(',
  'setTimeout(',
  'MutationObserver',
  'requestAnimationFrame(',
  "from '../combat-lab",
  "from '../../combat-lab",
]);

const defaultRegistrySource = read('src/game-editors/createDefaultGameEditorRegistry.ts');
const expectedIds = [
  'behaviorGraph',
  'tacticalPositions',
  'routeProfiles',
  'environmentProfiles',
  'movementProfiles',
  'weapons',
  'attentionProfiles',
  'soldierData',
  'directionalTerrain',
];
for (const id of expectedIds) {
  const count = defaultRegistrySource.split(`id: '${id}'`).length - 1;
  if (count !== 1) failures.push(`default registry: ${id} must be defined exactly once, found ${count}`);
}
expectIncludes('src/game-editors/createDefaultGameEditorRegistry.ts', [
  "surface === 'combat-lab'",
  "? 'route'",
  "const baseRoute = '/ai-node-editor.html'",
  "search.set('returnTo', request.returnTo)",
  'mountEnvironmentProfileEditor',
  "import { mountCombatCatalogEditor } from '../ai-node-editor/CombatCatalogEditor'",
  'mount: mountCombatCatalogEditor',
]);
expectExcludes('src/game-editors/createDefaultGameEditorRegistry.ts', [
  "import '../ai-node-editor/CombatCatalogEditor'",
  'requireLegacyAiEditorSection',
  'reusableWeaponsPanel',
  'weaponsParking',
  "from '../combat-lab",
  "from '../../combat-lab",
]);

for (const file of [
  'src/ai-node-editor/NavigationProfileEditor.ts',
  'src/ai-node-editor/TacticalPositionProfileEditor.ts',
  'src/ai-node-editor/MovementProfileEditorIntegration.ts',
  'src/ai-node-editor/EnvironmentProfileEditorIntegration.ts',
  'src/ai-node-editor/CombatCatalogEditor.ts',
  'src/ai-node-editor/DirectionalTerrainProfileEditor.ts',
]) {
  expectExcludes(file, [
    "document.querySelector<HTMLElement>('#ai-node-editor-root')",
    "document.querySelector<HTMLElement>('.navigation-profile-tabs')",
    "from '../combat-lab",
    "from '../../combat-lab",
  ]);
}

expectIncludes('src/ai-node-editor/CombatCatalogEditor.ts', [
  'export function mountCombatCatalogEditor',
  'const panel = context.host',
  'function ensureCatalogState()',
  'new CombatCatalogStorageAdapter(resolveBrowserStorage())',
  "panel.addEventListener('click', handlePanelClick)",
  "panel.removeEventListener('click', handlePanelClick)",
  'if (activePanel === panel) activePanel = null',
]);
expectExcludes('src/ai-node-editor/CombatCatalogEditor.ts', [
  'registerAiEditorSection',
  'AiEditorSectionRegistry',
  'installedPanels',
  'const storage = new CombatCatalogStorageAdapter',
]);

if (exists('src/ai-node-editor/AiEditorSectionRegistry.ts')) {
  failures.push('src/ai-node-editor/AiEditorSectionRegistry.ts: legacy registry file must be removed');
}
for (const sourceFile of walkFiles('src').filter((file) => /\.[cm]?[jt]sx?$/.test(file))) {
  if (read(sourceFile).includes('AiEditorSectionRegistry')) {
    failures.push(`${sourceFile}: runtime import/reference to AiEditorSectionRegistry remains`);
  }
}

expectIncludes('src/ai-node-editor/AiEditorGameEditorPlatform.ts', [
  'createDefaultGameEditorRegistry',
  'new GameEditorWorkspace',
  "registry.listForSurface('ai-editor')",
  'definition.labelRu',
  "const initialEditorId =",
  "'behaviorGraph'",
  'const graphRootElement = document.getElementById',
  'graphParking.append(graphRoot)',
  'context.host.replaceChildren(graphRoot)',
  'mountBehaviorGraph',
]);
expectExcludes('src/ai-node-editor/AiEditorGameEditorPlatform.ts', [
  'document.createElement(\'canvas\')',
  'new PIXI.Application',
  'Обновить',
  'Открыть игру',
  '>Выход<',
]);

expectIncludes('ai-node-editor.html', [
  '/src/game-editors/game-editor-workspace.css',
  '/src/ai-node-editor/AiEditorGameEditorPlatform.ts',
]);
expectExcludes('ai-node-editor.html', [
  '/src/ai-node-editor/NavigationProfileEditor.ts',
  '/src/ai-node-editor/MovementProfileEditorIntegration.ts',
  '/src/ai-node-editor/EnvironmentProfileEditorIntegration.ts',
  '/src/ai-node-editor/DirectionalTerrainProfileEditor.ts',
]);

const aiEditorCss = read('src/ai-node-editor/ai-node-editor.css');
const aiEditorBodyRule = aiEditorCss.match(/(?:^|\n)body\s*\{([^}]*)\}/i)?.[1] ?? '';
const fixedAiEditorBodyMinWidth = aiEditorBodyRule.match(/min-width\s*:\s*(\d+(?:\.\d+)?)px/i);
if (fixedAiEditorBodyMinWidth && Number(fixedAiEditorBodyMinWidth[1]) > 0) {
  failures.push('src/ai-node-editor/ai-node-editor.css: editor body must not enforce a positive fixed min-width');
}

const combatLabCss = read('src/combat-lab/combat-lab.css');
if (/body\.app-shell-mode-combat-lab\s+\.app-shell-menu\s*\{[^}]*display\s*:\s*none(?:\s*!important)?\s*;?[^}]*\}/i.test(combatLabCss)) {
  failures.push('src/combat-lab/combat-lab.css: common app-shell menu must remain visible in Combat Lab');
}

if (failures.length > 0) {
  console.error('Shared game editor platform smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

await import('./shared_game_editor_registry_smoke.mjs');
console.log('Shared game editor platform smoke passed.');
