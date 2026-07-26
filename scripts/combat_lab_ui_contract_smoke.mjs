import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [shell, session, checkpoint, renderer, overlay, adapter, commands, menu, labMain] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabShell.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabCheckpoint.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabDiagnosticOverlayRenderer.ts', 'utf8'),
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
assert.match(checkpoint, /buildExportedScene/);
assert.match(checkpoint, /restoreExportedScene/);
assert.match(checkpoint, /restoreImportedInfantryCombatState/);

assert.match(renderer, /PixiTacticalBoardApp\.create/);
assert.match(renderer, /installCombatEffectsRenderer/);
assert.match(renderer, /installAttentionOverlayRenderer/);
assert.match(renderer, /installAdaptiveGridLod/);
assert.match(renderer, /ensureStateBound/);
assert.match(renderer, /adapter\.bindSimulationState\(this\.session\.state\)/);
assert.doesNotMatch(renderer, /new Application\s*\(/, 'Combat Lab must not own a second Pixi Application.');
assert.doesNotMatch(renderer, /tickSimulation\(/, 'Renderer must advance only through CombatLabVisualSession.');

assert.match(overlay, /MAX_COMBAT_LAB_TRAIL_POINTS\s*=\s*4096/);
assert.match(overlay, /bindSession\(/);
assert.match(overlay, /layer\.enabled/);
assert.doesNotMatch(overlay, /new Application\s*\(/);
assert.doesNotMatch(overlay, /drawMetreGrid|drawUnit|mapWidthPx|mapHeightPx/);
assert.match(adapter, /bindSimulationState/);
assert.match(adapter, /boardInput\.state\s*=\s*state/);

assert.match(labMain, /installAppShellMenu\(\{ mode: 'combat-lab' \}\)/);
assert.match(menu, /href=\"\/\"/);
assert.match(menu, /href=\"\/ai-node-editor\.html\"/);
assert.match(menu, /href=\"\/combat-lab\.html\"/);
assert.match(menu, /aria-current=\"page\"/);

console.log('Combat Lab UI production-boundary smoke passed.');
