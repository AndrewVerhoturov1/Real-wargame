import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [contracts, experimentIndex, coreIndex] = await Promise.all([
  readFile('src/core/testing/combat-lab/experiment/CombatLabExperimentContracts.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/index.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/index.ts', 'utf8'),
]);

assert.match(contracts, /interface\s+CombatLabExperimentV1[\s\S]*schemaVersion:\s*1/);
assert.match(contracts, /kind:\s*'point'/);
assert.match(contracts, /kind:\s*'circle'/);

for (const action of [
  'fire',
  'stop_fire',
  'move',
  'posture',
  'wait',
  'reload',
  'deploy',
  'undeploy',
  'transfer',
  'first_aid',
]) {
  assert.match(contracts, new RegExp(`kind:\\s*'${action}'`), `Missing action ${action}`);
}

for (const condition of [
  'always',
  'elapsed',
  'step_state',
  'role_state',
  'contact',
  'ammo',
  'suppression',
]) {
  assert.match(contracts, new RegExp(`kind:\\s*'${condition}'`), `Missing condition ${condition}`);
}

for (const state of [
  'pending',
  'waiting',
  'running',
  'completed',
  'failed',
  'skipped',
  'paused_at_breakpoint',
]) {
  assert.match(contracts, new RegExp(`'${state}'`), `Missing step runtime state ${state}`);
}

assert.match(contracts, /maximumAttempts/);
assert.match(contracts, /maximumTracks:\s*64/);
assert.match(contracts, /maximumSteps:\s*512/);
assert.match(contracts, /maximumMarkers:\s*256/);
assert.match(contracts, /maximumRunCount:\s*10_000/);
assert.match(contracts, /maximumWorkerCount:\s*4/);
assert.match(contracts, /maximumRepeatAttempts:\s*1_000/);
assert.match(contracts, /roleId/);
assert.match(contracts, /markerId/);
assert.doesNotMatch(contracts, /\bany\b/, 'Public contracts must not expose any.');
assert.doesNotMatch(
  contracts,
  /\b(document|window|HTMLElement|HTMLCanvasElement|PIXI|pixi\.js|setInterval|requestAnimationFrame)\b/,
  'Experiment contracts must remain independent from browser and PixiJS APIs.',
);
assert.match(experimentIndex, /export \* from '\.\/CombatLabExperimentContracts'/);
assert.match(coreIndex, /export \* from '\.\/experiment'/);

console.log('Combat Lab Stage 10 experiment contract smoke passed.');
