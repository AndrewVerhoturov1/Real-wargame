import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pixiAppSource, mainSource, indexSource] = await Promise.all([
  readFile(new URL('../src/rendering/PixiApp.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

assert.match(
  mainSource,
  /\(board as unknown as \{ showGrid: boolean \}\)\.showGrid = false;[\s\S]*board\.start\(\);/,
  'Grid rendering must be disabled before the first board render.',
);
assert.match(mainSource, /gridButton\.textContent = 'Сетка: выкл';/, 'Russian controls must show the grid as disabled.');
assert.match(mainSource, /gridButton\.setAttribute\('aria-pressed', 'false'\);/, 'Grid button accessibility state must start disabled.');
assert.match(mainSource, /gridButton\.classList\.add\('hud-toggle-off'\);/, 'Grid button must keep the disabled visual style.');
assert.match(pixiAppSource, /handleGridToggle[\s\S]*this\.showGrid = !this\.showGrid;/, 'Grid button must keep toggling the renderer state.');
assert.match(indexSource, /id="grid-toggle"[\s\S]*aria-pressed="false"[\s\S]*Сетка: выкл/, 'Initial HTML fallback must keep the grid disabled.');

console.log('Map grid default visibility smoke passed.');
