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
  'GROUP_ORDER',
  'Object.freeze',
]);
expectExcludes('src/game-editors/GameEditorRegistry.ts', ['document.', 'window.', 'querySelector', 'localStorage']);

expectIncludes('src/game-editors/GameEditorWorkspace.ts', [
  'beforeClose',
  'installation.destroy()',
  'route(request)',
  'destroyed',
  'host.replaceChildren()',
]);
expectExcludes('src/game-editors/GameEditorWorkspace.ts', [
  'setInterval(',
  'setTimeout(',
  'MutationObserver',
  'requestAnimationFrame(',
  'combat-lab',
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
  "surface === 'ai-editor' ? 'embedded' : 'route'",
  "return '/ai-node-editor.html'",
  'mountEnvironmentProfileEditor',
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
    "from './AiEditorSectionRegistry'",
    "from '../combat-lab",
    "from '../../combat-lab",
  ]);
}

expectIncludes('src/ai-node-editor/AiEditorGameEditorPlatform.ts', [
  'createDefaultGameEditorRegistry',
  'new GameEditorWorkspace',
  'registry.listForSurface',
  'definition.labelRu',
  "editorId: 'behaviorGraph'",
]);
expectExcludes('src/ai-node-editor/AiEditorGameEditorPlatform.ts', [
  'Обновить',
  'Открыть игру',
  '>Выход<',
]);

expectIncludes('ai-node-editor.html', [
  '/src/game-editors/game-editor-workspace.css',
  '/src/ai-node-editor/AiEditorGameEditorPlatform.ts',
  '/src/ai-node-editor/EnvironmentProfileEditorIntegration.ts',
]);
expectExcludes('ai-node-editor.html', [
  '/src/ai-node-editor/NavigationProfileEditor.ts',
  '/src/ai-node-editor/TacticalPositionProfileEditor.ts',
  '/src/ai-node-editor/MovementProfileEditorIntegration.ts',
  '/src/ai-node-editor/CombatCatalogEditor.ts',
  '/src/ai-node-editor/DirectionalTerrainProfileEditor.ts',
]);

if (exists('src/ai-node-editor/AiEditorSectionRegistry.ts')) {
  failures.push('legacy AiEditorSectionRegistry.ts must be removed');
}

if (failures.length > 0) {
  console.error('Shared game editor platform smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Shared game editor platform smoke passed.');
