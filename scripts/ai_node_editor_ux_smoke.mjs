import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'src/ai-node-editor/main.ts',
  'src/ai-node-editor/main-ux.ts',
  'src/ai-node-editor/editor-ui-preferences.ts',
  'src/ai-node-editor/ai-node-editor-ux.css',
  'src/ai-node-editor/editor-refinement.ts',
  'src/ai-node-editor/editor-refinement.css',
  'src/ai-node-editor/human-node-ui.ts',
];

for (const file of requiredFiles) {
  if (!existsSync(path.join(repoRoot, file))) fail(`Не найден обязательный файл: ${file}`);
}

const facade = read('src/ai-node-editor/main.ts');
const main = read('src/ai-node-editor/main-ux.ts');
const preferences = read('src/ai-node-editor/editor-ui-preferences.ts');
const css = read('src/ai-node-editor/ai-node-editor-ux.css');
const refinement = read('src/ai-node-editor/editor-refinement.ts');
const refinementCss = read('src/ai-node-editor/editor-refinement.css');
const humanUi = read('src/ai-node-editor/human-node-ui.ts');

expectContains(facade, "from './main-ux';", 'Основной entrypoint должен подключать новый редактор.');
expectContains(facade, "import './editor-refinement';", 'Основной entrypoint должен подключать слой доработки интерфейса.');
expectContains(facade, "from './editor-refinement';", 'Основной entrypoint должен экспортировать операции исходящих связей.');

for (const needle of [
  'real-wargame.ai-node-editor.favorites.v1',
  'loadFavoriteNodeTypes',
  'saveFavoriteNodeTypes',
  'getEditorText',
  'getCategoryLabel',
]) expectContains(preferences, needle, `Настройки редактора должны содержать: ${needle}`);

for (const needle of [
  "type PaletteFilter = 'all' | 'favorites' | AiNodeCategory",
  'paletteSearch',
  'paletteFilter',
  'data-palette-filter',
  'data-palette-favorite',
  'toggleFavoriteNodeType',
  'setPaletteFilter',
  'setPaletteSearch',
  'getIncomingFlowParents',
  'removeTypedInputBinding',
  'removeIncomingFlowLink',
  'removeAllIncomingLinks',
  'data-unlink-data-input',
  'data-unlink-flow-parent',
  'data-unlink-all-incoming',
  "binding.source !== 'node' || binding.nodeId !== deleting",
]) expectContains(main, needle, `Новый редактор должен содержать: ${needle}`);

for (const forbidden of [
  'Select / выбрать',
  'Add child Action',
  'Set as link source',
  'Link source → this',
  'Center view',
  'Unlink all children',
]) expectNotContains(main, forbidden, `Русский интерфейс не должен содержать смешанную команду: ${forbidden}`);

for (const needle of [
  'html,\nbody',
  'overflow: hidden',
  '.palette-search',
  '.palette-filter-row',
  '.palette-filter',
  '.palette-node-row',
  '.palette-favorite',
  '[data-category="flow"]',
  '[data-category="condition"]',
  '[data-category="action"]',
  '.node-input-link-control',
  '.node-data-port.connected',
  '.node-port.in.connected',
  '.incoming-link-menu',
  '@media (max-width: 1500px)',
  'grid-template-columns: 228px minmax(0, 1fr) 300px',
  'height: calc(100vh - 42px)',
]) expectContains(css, needle, `Стили редактора должны содержать: ${needle}`);

for (const needle of [
  'PANEL_WIDTHS_STORAGE_KEY',
  'real-wargame.ai-node-editor.panel-widths.v1',
  'paletteWidth',
  'inspectorWidth',
  'palette-filter-select',
  'data-resize-panel',
  'getOutgoingDataConsumers',
  'removeOutgoingDataLink',
  'removeAllOutgoingLinks',
  'node-output-link-control',
  'outgoing-link-menu',
  'inspector-save-bridge',
  'Сохранить ноду',
  'data-menu-action="unlink-outgoing"',
  "main.style.setProperty('grid-template-columns'",
  'positionPanelResizers',
]) expectContains(refinement, needle, `Слой доработки редактора должен содержать: ${needle}`);

for (const needle of [
  '--palette-width',
  '--inspector-width',
  'var(--palette-width, 228px)',
  'var(--inspector-width, 300px)',
  '.panel-resizer',
  'width: 18px',
  '[data-resize-panel="palette"]',
  '[data-resize-panel="inspector"]',
  '.palette-filter-select',
  '.node-output-link-control',
  '.outgoing-link-menu',
  '.inspector-save-bridge',
  '.refined-inspector-summary',
  '.refined-inspector-links',
  '.refined-inspector-danger',
]) expectContains(refinementCss, needle, `Стили доработки редактора должны содержать: ${needle}`);

expectNotContains(refinementCss, 'right: -4px', 'Зона захвата палитры не должна быть наполовину обрезана панелью.');
expectNotContains(refinementCss, 'left: -4px', 'Зона захвата инспектора не должна быть наполовину обрезана панелью.');
expectContains(humanUi, 'human-save-node', 'Единый человеческий интерфейс должен сохранять ноду одной кнопкой.');
expectNotContains(css, 'calc(100vh - 90px)', 'Компактная раскладка не должна терять 90 пикселей на двухрядное меню.');

console.log('[ГОТОВО] AI Node Editor UX smoke passed.');

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function expectContains(content, needle, message) {
  if (!content.includes(needle)) fail(message);
  console.log(`[OK] contains: ${needle}`);
}

function expectNotContains(content, needle, message) {
  if (content.includes(needle)) fail(message);
  console.log(`[OK] does not contain: ${needle}`);
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}
