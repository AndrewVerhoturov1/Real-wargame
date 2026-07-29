import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [controller, runState] = await Promise.all([
  readFile('src/combat-lab/runtime/CombatLabExperimentVisualController.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabExperimentRunState.ts', 'utf8'),
]);

assert.match(controller, /beforeSimulationStep\(\): void/);
assert.match(controller, /executor\.beforeSimulationStep\(\)/);
assert.match(controller, /step\.state === 'paused_at_breakpoint'/);
assert.match(controller, /this\.blockedBeforeTick = true[\s\S]*this\.options\.session\.setPaused\(true\)/);
assert.match(controller, /shouldAdvanceSimulationStep\(\): boolean \{[\s\S]*!this\.blockedBeforeTick/);
assert.match(controller, /let advanced = this\.options\.session\.stepOnce\(\)[\s\S]*if \(!advanced && this\.blockedBeforeTick\)[\s\S]*this\.options\.session\.stepOnce\(\)/);
assert.match(runState, /'breakpoint_reached'/);
assert.match(runState, /step\.state === 'paused_at_breakpoint'/);
assert.doesNotMatch(controller, /executeCombatLabCommand/);

console.log('Combat Lab visual breakpoint smoke passed.');
