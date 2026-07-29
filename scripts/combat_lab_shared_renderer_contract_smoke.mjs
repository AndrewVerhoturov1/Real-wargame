import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => existsSync(path.join(root, relativePath));

assert.ok(exists('src/game/GameApplication.ts'), 'Shared full game application is missing.');
assert.ok(exists('src/rendering/PixiTacticalBoardAdapter.ts'), 'Shared board adapter is missing.');
const gameApplication = read('src/game/GameApplication.ts');
const adapter = read('src/rendering/PixiTacticalBoardAdapter.ts');
assert.match(adapter, /interface PixiTacticalBoardAdapter/);
assert.match(adapter, /getWorldContainer\(\): Container/);
assert.match(adapter, /addTickerListener\(/);
assert.match(gameApplication, /PixiTacticalBoardApp\.create/);
assert.match(gameApplication, /installCombatEffectsRenderer/);
assert.match(gameApplication, /installAttentionOverlayRenderer/);
assert.match(gameApplication, /installAdaptiveGridLod/);
assert.match(gameApplication, /installGameEditorWorkbench/);
assert.match(gameApplication, /installTacticalWorkspace/);

assert.ok(exists('src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts'), 'Combat Lab diagnostic overlay is missing.');
const overlay = read('src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts');
assert.doesNotMatch(overlay, /new Application\s*\(/);
assert.doesNotMatch(overlay, /app\.init\s*\(/);
assert.doesNotMatch(overlay, /drawMetreGrid|mapWidthPx|mapHeightPx/);
assert.match(overlay, /MAX_COMBAT_LAB_TRAIL_POINTS/);
assert.match(overlay, /bindSession\(/);

const renderer = read('src/combat-lab/rendering/CombatLabRenderer.ts');
assert.doesNotMatch(renderer, /new Application\s*\(/);
assert.doesNotMatch(renderer, /app\.init\s*\(/);
assert.doesNotMatch(renderer, /PixiTacticalBoardApp\.create/);
assert.doesNotMatch(renderer, /installCombatEffectsRenderer|installAttentionOverlayRenderer|installAdaptiveGridLod/);
assert.match(renderer, /context\.getWorldContainer\(\)/);
assert.match(renderer, /context\.addTickerListener\(/);
assert.match(renderer, /context\.restartStateBoundServices\(\)/);
assert.match(renderer, /session\.advance\(/);

const labEntry = read('src/combat-lab/main.ts');
assert.match(labEntry, /GameApplication\.create\(/);
assert.match(labEntry, /installAppShellMenu\(\{ mode: 'combat-lab' \}\)/);

const menu = read('src/shared/AppShellMenu.ts');
assert.match(menu, /'combat-lab'/);
for (const route of ['/', '/ai-node-editor.html', '/combat-lab.html']) {
  assert.ok(menu.includes(route), `Shared menu route is missing: ${route}`);
}
assert.match(menu, /aria-current/);

const gameEntry = read('src/main.ts');
const aiEditorMenuEntry = read('src/shared/AiEditorShellMenuEntry.ts');
const viteConfig = read('vite.config.ts');
const protectedAiEntry = read('src/ai-node-editor/main.ts');
assert.match(gameEntry, /GameApplication\.create\(/);
assert.match(gameEntry, /installAppShellMenu\(\{ mode: 'game' \}\)/);
assert.match(aiEditorMenuEntry, /installAppShellMenu\(\{ mode: 'editor' \}\)/);
assert.match(viteConfig, /AiEditorShellMenuEntry\.ts/);
assert.match(viteConfig, /context\.path\.endsWith\('\/ai-node-editor\.html'\)/);
assert.doesNotMatch(protectedAiEntry, /AppShellMenu|installAppShellMenu/);

console.log('Combat Lab shared full-game renderer contract passed.');
