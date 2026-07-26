import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [shell, session, checkpoint, renderer, commands] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabShell.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabCheckpoint.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabCommands.ts', 'utf8'),
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
assert.match(renderer, /MAX_COMBAT_LAB_TRAIL_POINTS\s*=\s*4096/);
assert.match(renderer, /destroy\(\): void/);
assert.match(renderer, /layer\.enabled/);
assert.doesNotMatch(renderer, /tickSimulation\(/, 'Renderer must not own simulation progression.');

console.log('Combat Lab UI production-boundary smoke passed.');
