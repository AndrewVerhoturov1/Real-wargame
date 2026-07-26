import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const exists = (relativePath) => existsSync(path.join(root, relativePath));
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

assert.ok(exists('src/game/GameApplication.ts'), 'Reusable full GameApplication is missing.');
assert.ok(exists('src/game/GameApplicationTypes.ts'), 'GameApplication public contracts are missing.');
assert.ok(exists('src/game/GameStyles.ts'), 'Shared game style entry is missing.');
assert.ok(exists('src/combat-lab/CombatLabExtension.ts'), 'Combat Lab game extension is missing.');

const gameMain = read('src/main.ts');
const labMain = read('src/combat-lab/main.ts');
const gameApplication = read('src/game/GameApplication.ts');
const labHtml = read('combat-lab.html');
const session = read('src/combat-lab/runtime/CombatLabVisualSession.ts');
const extension = read('src/combat-lab/CombatLabExtension.ts');

assert.match(gameMain, /GameApplication\.create\(/, 'Game entry must use the reusable GameApplication.');
assert.match(labMain, /GameApplication\.create\(/, 'Combat Lab entry must use the reusable GameApplication.');
assert.doesNotMatch(labMain, /PixiTacticalBoardApp\.create\(/, 'Combat Lab must not create the board directly.');

for (const id of [
  'app',
  'hud',
  'language-toggle',
  'grid-toggle',
  'vision-toggle',
  'height-toggle',
  'pause-toggle',
  'ai-editor-open',
  'debug-panel',
  'combat-lab-extension-root',
]) {
  assert.match(labHtml, new RegExp(`id=["']${id}["']`), `Combat Lab is missing full game DOM element #${id}.`);
}

for (const marker of [
  'installGameEditorWorkbench',
  'installAttentionProfileControls',
  'installSceneExportControls',
  'installPerformanceReportControls',
  'installTacticalWorkspace',
  'installCombatControls',
  'installAttentionRuntimePanel',
  'installCommandPlanRouteUi',
  'installRouteCostOverlayUi',
  'installAiDictionaryGameIntegration',
  'installFrontZoneControls',
  'installEditorHeaderPlacement',
  'installWorkspaceTooltipGuard',
]) {
  assert.match(gameApplication, new RegExp(marker), `GameApplication is missing ${marker}.`);
}

assert.match(gameApplication, /restartStateBoundServices\(\): void/);
assert.match(gameApplication, /installExtension/);
assert.match(gameApplication, /addTickerListener/);
assert.match(gameApplication, /getWorldContainer/);
assert.match(session, /replaceCombatLabStateInPlace/);
assert.match(session, /const stableState\s*=\s*this\.built\.state/);
assert.match(extension, /context\.restartStateBoundServices\(\)/);
assert.match(extension, /context\.addTickerListener\(/);
assert.match(extension, /context\.getWorldContainer\(\)/);
assert.doesNotMatch(extension, /PixiTacticalBoardApp\.create\(/);

console.log('Combat Lab full-game application contract passed.');
