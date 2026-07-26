import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  shell,
  session,
  checkpoint,
  renderer,
  overlay,
  extension,
  gameApplication,
  adapter,
  commands,
  menu,
  labMain,
] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabShell.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabCheckpoint.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/game/GameApplication.ts', 'utf8'),
  readFile('src/rendering/PixiTacticalBoardAdapter.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabCommands.ts', 'utf8'),
  readFile('src/shared/AppShellMenu.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
]);

for (const marker of [
  'requestFireTask',
  'cancelSingleFireTask',
  'requestPlayerPostureTransition',
  'requestReloadWeapon',
  'requestDeployWeapon',
  'requestUndeployWeapon',
  'requestAmmoTransfer',
  'requestApplyFirstAidAction',
]) assert.match(commands, new RegExp(marker));

assert.doesNotMatch(shell, /roundsInWeapon\s*=/, 'UI must not directly mutate weapon rounds.');
assert.doesNotMatch(shell, /activeFireTask\s*=/, 'UI must not create FireTask state directly.');
assert.doesNotMatch(shell, /activeProjectiles\.(push|splice)/, 'UI must not create projectile state.');
assert.doesNotMatch(commands, /spawnReferenceProjectile|spawnProjectile|createProjectileCandidate/);
assert.match(session, /markInteractive/);
assert.match(session, /replaceCombatLabStateInPlace/);
assert.match(session, /const stableState\s*=\s*this\.built\.state/);
assert.match(checkpoint, /buildExportedScene/);
assert.match(checkpoint, /restoreExportedScene/);
assert.match(checkpoint, /restoreImportedInfantryCombatState/);

assert.doesNotMatch(renderer, /PixiTacticalBoardApp\.create/);
assert.doesNotMatch(renderer, /installCombatEffectsRenderer|installAttentionOverlayRenderer|installAdaptiveGridLod/);
assert.match(renderer, /context\.getWorldContainer\(\)/);
assert.match(renderer, /context\.addTickerListener\(/);
assert.match(renderer, /context\.restartStateBoundServices\(\)/);
assert.match(renderer, /session\.advance\(/);
assert.doesNotMatch(renderer, /new Application\s*\(/, 'Combat Lab must not own a second Pixi Application.');
assert.doesNotMatch(renderer, /tickSimulation\(/, 'Renderer must advance only through CombatLabVisualSession.');

assert.match(extension, /CombatLabShell/);
assert.match(extension, /combat-lab-drawer/);
assert.match(extension, /combat-lab-drawer-toggle/);
assert.match(extension, /aria-expanded/);

for (const marker of [
  'installGameEditorWorkbench',
  'installTacticalWorkspace',
  'installCombatControls',
  'installAttentionRuntimePanel',
  'installCommandPlanRouteUi',
  'installRouteCostOverlayUi',
  'installAiDictionaryGameIntegration',
]) assert.match(gameApplication, new RegExp(marker));
assert.match(gameApplication, /installExtension/);
assert.match(gameApplication, /restartStateBoundServices\(\): void/);

assert.match(overlay, /MAX_COMBAT_LAB_TRAIL_POINTS\s*=\s*4096/);
assert.match(overlay, /bindSession\(/);
assert.match(overlay, /layer\.enabled/);
assert.doesNotMatch(overlay, /new Application\s*\(/);
assert.doesNotMatch(overlay, /drawMetreGrid|drawUnit|mapWidthPx|mapHeightPx/);
assert.match(adapter, /getWorldContainer/);
assert.match(adapter, /addTickerListener/);

assert.match(labMain, /GameApplication\.create\(/);
assert.match(labMain, /installAppShellMenu\(\{ mode: 'combat-lab' \}\)/);
assert.match(menu, /modeLink\('\/', 'game', 'Игра', mode\)/);
assert.match(menu, /modeLink\('\/ai-node-editor\.html', 'editor', 'Редактор ИИ', mode\)/);
assert.match(menu, /modeLink\('\/combat-lab\.html', 'combat-lab', 'Испытательный полигон', mode\)/);
assert.match(menu, /aria-current="page"/);

console.log('Combat Lab full-game UI production-boundary smoke passed.');
