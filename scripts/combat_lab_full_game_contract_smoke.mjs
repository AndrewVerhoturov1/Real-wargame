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
assert.ok(exists('src/ui/TacticalWorkspaceLayoutEnhancements.ts'), 'Shared workspace layout enhancements are missing.');
assert.ok(exists('src/ui/UnitBarPresentation.ts'), 'Shared weapon-aware soldier panel presentation is missing.');
assert.ok(exists('src/tactical-workspace-refined.css'), 'Shared refined workspace CSS is missing.');
assert.ok(exists('src/tactical-workspace-production.css'), 'Shared production workspace CSS is missing.');
assert.ok(exists('src/combat-lab/combat-lab-ui-polish.css'), 'Combat Lab compact inspector CSS is missing.');

const gameMain = read('src/main.ts');
const labMain = read('src/combat-lab/main.ts');
const gameApplication = read('src/game/GameApplication.ts');
const gameStyles = read('src/game/GameStyles.ts');
const labHtml = read('combat-lab.html');
const session = read('src/combat-lab/runtime/CombatLabVisualSession.ts');
const extension = read('src/combat-lab/CombatLabExtension.ts');
const renderer = read('src/combat-lab/rendering/CombatLabRenderer.ts');
const orderStatusCard = read('src/ui/TacticalOrderStatusCard.ts');
const combatAudio = read('src/ui/CombatAudio.ts');
const combatEffectsInstaller = read('src/rendering/CombatEffectsInstaller.ts');
const combatEffectsRenderer = read('src/rendering/PixiCombatEffectsRenderer.ts');
const layoutEnhancements = read('src/ui/TacticalWorkspaceLayoutEnhancements.ts');
const unitBarPresentation = read('src/ui/UnitBarPresentation.ts');
const refinedCss = read('src/tactical-workspace-refined.css');
const productionCss = read('src/tactical-workspace-production.css');
const extensionBoundary = `${extension}\n${renderer}`;

assert.match(gameMain, /GameApplication\.create\(/, 'Game entry must use the reusable GameApplication.');
assert.match(labMain, /GameApplication\.create\(/, 'Combat Lab entry must use the reusable GameApplication.');
assert.doesNotMatch(labMain, /PixiTacticalBoardApp\.create\(/, 'Combat Lab must not create the board directly.');
assert.match(labMain, /combat-lab-ui-polish\.css/, 'Combat Lab compact overrides must load after the legacy laboratory CSS.');

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
assert.match(extensionBoundary, /installStableViewportResize/);
assert.match(extensionBoundary, /world\.position\.set/);
assert.match(extensionBoundary, /worldScaleX/);
assert.match(extensionBoundary, /worldScaleY/);
assert.doesNotMatch(extensionBoundary, /PixiTacticalBoardApp\.create\(/);

assert.doesNotMatch(orderStatusCard, /document\.body\.append/, 'The map-obscuring tactical order card must not mount into the page.');
assert.doesNotMatch(orderStatusCard, /className\s*=\s*['"]tactical-order-card/, 'The retired order card must not render hidden duplicate UI.');
assert.match(combatAudio, /export function installCombatAudioUnlock/);
assert.match(combatAudio, /pointerdown/);
assert.match(combatAudio, /pointerup/);
assert.match(combatAudio, /keydown/);
assert.match(combatAudio, /let combatAudioEnabled = true/);
assert.match(combatAudio, /pendingShotCount/);
assert.match(combatAudio, /flushPendingShots/);
assert.match(combatAudio, /latencyHint:\s*'interactive'/);
assert.match(combatAudio, /ensureRifleShotBuffer/);
assert.match(combatAudio, /createBuffer\(1, frameCount/);
assert.match(combatAudio, /ensureOutputAnalyser/);
assert.match(combatAudio, /lastOutputPeak/);
assert.match(combatAudio, /playedShotCount/);
assert.match(combatAudio, /__realWargameCombatAudio/);
assert.match(combatEffectsInstaller, /installCombatAudioUnlock\(\)/, 'All game modes must share one combat-audio unlock path.');
assert.match(combatEffectsInstaller, /destroyAudioUnlock\(\)/, 'Combat-audio listeners need symmetric teardown.');
assert.equal((combatEffectsRenderer.match(/playRifleShot\(\)/g) ?? []).length, 1, 'One committed shot must produce exactly one rifle sound.');

for (const marker of [
  'getWeaponRuntime(unit)',
  'getWeaponDefinition(runtime.weaponId)',
  'weaponVisualKind(definition)',
  'weaponSilhouette(kind)',
  'unit-bar-weapon',
  'Технический идентификатор:',
]) assert.ok(unitBarPresentation.includes(marker), `Weapon-aware shared soldier panel must contain ${marker}.`);

assert.match(gameStyles, /TacticalWorkspaceLayoutEnhancements/);
assert.match(gameStyles, /tactical-workspace-production\.css/);
for (const marker of [
  'workspace-time-controls',
  'workspace-resize-handle-left',
  'workspace-resize-handle-right',
  "['step', 'evaluate', 'execute', 'reset-unit']",
  '.unit-attention-profile',
  '.unit-attention-mode',
  '[data-role="state-plan-panel"]',
]) assert.ok(layoutEnhancements.includes(marker), `Refined workspace must contain ${marker}.`);
assert.match(refinedCss, /--workspace-sidebar:\s*370px/);
assert.match(refinedCss, /--combat-lab-dock-width:\s*370px/);
assert.match(productionCss, /grid-template-areas:\s*\n\s*"profile stats"\s*\n\s*"posture controls"/);
assert.match(productionCss, /\.unit-bar-weapon/);
assert.match(productionCss, /\.workspace-time-controls \.unit-bar-speed-group\s*\{[^}]*grid-template-columns:\s*repeat\(6/s);

console.log('Combat Lab full-game application contract passed.');
