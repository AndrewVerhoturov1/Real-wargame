import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => existsSync(path.join(root, relativePath));

assert.ok(exists('src/rendering/PixiTacticalBoardOptions.ts'), 'Shared board options module is missing.');
const options = read('src/rendering/PixiTacticalBoardOptions.ts');
assert.match(options, /interface PixiTacticalBoardOptions/);
assert.match(options, /advanceFrame\?/);
assert.match(options, /attachBoardInput\?/);
assert.match(options, /afterRenderFrame\?/);

const pixiApp = read('src/rendering/PixiApp.ts');
assert.match(pixiApp, /replaceState\(state: SimulationState\)/);
assert.match(pixiApp, /getWorldOverlayContainer\(\): Container/);
assert.match(pixiApp, /setGridVisible\(value: boolean\)/);
assert.match(pixiApp, /setViewConesVisible\(value: boolean\)/);
assert.match(pixiApp, /setHeightLabelsVisible\(value: boolean\)/);
assert.match(pixiApp, /options\.advanceFrame/);

assert.ok(exists('src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts'), 'Combat Lab diagnostic overlay is missing.');
const overlay = read('src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts');
assert.doesNotMatch(overlay, /new Application\s*\(/);
assert.doesNotMatch(overlay, /app\.init\s*\(/);
assert.doesNotMatch(overlay, /drawMetreGrid|mapWidthPx|mapHeightPx/);
assert.match(overlay, /MAX_COMBAT_LAB_TRAIL_POINTS/);
assert.match(overlay, /bindSession\(/);
assert.equal(exists('src/combat-lab/rendering/CombatLabRenderer.ts'), false, 'Standalone CombatLabRenderer must be removed.');

assert.ok(exists('src/combat-lab/runtime/CombatLabBoardRuntime.ts'), 'Combat Lab board runtime is missing.');
const runtime = read('src/combat-lab/runtime/CombatLabBoardRuntime.ts');
assert.match(runtime, /PixiTacticalBoardApp\.create/);
assert.match(runtime, /installCombatEffectsRenderer/);
assert.match(runtime, /replaceScenarioState\(/);
assert.match(runtime, /destroyStateBoundServices/);
assert.match(runtime, /board\.replaceState\(this\.session\.state\)/);

const labEntry = read('src/combat-lab/main.ts');
assert.match(labEntry, /installAppShellMenu\(\{ mode: 'combat-lab' \}\)/);
assert.doesNotMatch(labEntry, /CombatLabRenderer/);

const menu = read('src/shared/AppShellMenu.ts');
assert.match(menu, /'combat-lab'/);
for (const route of ['/', '/ai-node-editor.html', '/combat-lab.html']) {
  assert.ok(menu.includes(route), `Shared menu route is missing: ${route}`);
}
assert.match(menu, /aria-current/);

const gameEntry = read('src/main.ts');
const aiEntry = read('src/ai-node-editor/main.ts');
assert.match(gameEntry, /installAppShellMenu\(\{ mode: 'game' \}\)/);
assert.match(aiEntry, /installAppShellMenu\(\{ mode: 'editor' \}\)/);

console.log('Combat Lab shared game renderer contract passed.');
