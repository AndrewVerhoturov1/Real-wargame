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
const renderer = read('src/combat-lab/rendering/CombatLabRenderer.ts');
const orderStatusCard = read('src/ui/TacticalOrderStatusCard.ts');
const combatAudio = read('src/ui/CombatAudio.ts');
const combatEffectsInstaller = read('src/rendering/CombatEffectsInstaller.ts');
const combatEffectsRenderer = read('src/rendering/PixiCombatEffectsRenderer.ts');
const extensionBoundary = `${extension}\n${renderer}`;

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
assert.match(extensionBoundary, /context\.restartStateBoundServices\(\)/);
assert.match(extensionBoundary, /context\.addTickerListener\(/);
assert.match(extensionBoundary, /context\.getWorldContainer\(\)/);
assert.doesNotMatch(extensionBoundary, /PixiTacticalBoardApp\.create\(/);

assert.doesNotMatch(orderStatusCard, /document\.body\.append/, 'The map-obscuring tactical order card must not mount into the page.');
assert.doesNotMatch(orderStatusCard, /className\s*=\s*['"]tactical-order-card/, 'The retired order card must not render hidden duplicate UI.');
assert.match(combatAudio, /export function installCombatAudioUnlock/);
assert.match(combatAudio, /pointerdown/);
assert.match(combatAudio, /keydown/);
assert.match(combatEffectsInstaller, /installCombatAudioUnlock\(\)/, 'All game modes must share one combat-audio unlock path.');
assert.match(combatEffectsInstaller, /destroyAudioUnlock\(\)/, 'Combat-audio listeners need symmetric teardown.');
assert.equal((combatEffectsRenderer.match(/playRifleShot\(\)/g) ?? []).length, 1, 'One committed shot must produce exactly one rifle sound.');

console.log('Combat Lab full-game application contract passed.');
