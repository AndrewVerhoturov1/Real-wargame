import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'src/ai-node-editor/main.ts',
  'src/ai-node-editor/main-ux.ts',
  'src/ai-node-editor/editor-ui-preferences.ts',
  'src/ai-node-editor/ai-node-editor-ux.css',
];

for (const file of requiredFiles) {
  if (!existsSync(path.join(repoRoot, file))) fail(`Не найден обязательный файл: ${file}`);
}

const facade = read('src/ai-node-editor/main.ts');
const main = read('src/ai-node-editor/main-ux.ts');
const preferences = read('src/ai-node-editor/editor-ui-preferences.ts');
const css = read('src/ai-node-editor/ai-node-editor-ux.css');

expectContains(facade, "export * from './main-ux';", 'Основной entrypoint должен подключать новый редактор.');

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
