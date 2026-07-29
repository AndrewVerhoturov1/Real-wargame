import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [builtIns, registry] = await Promise.all([
  readFile('src/core/testing/combat-lab/experiment/CombatLabBuiltInExperiments.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabScenarioRegistry.ts', 'utf8'),
]);
assert.match(builtIns, /buildCombatLabBuiltInExperiment\(/);
assert.match(builtIns, /listCombatLabBuiltInExperiments\(/);
assert.match(builtIns, /buildCombatLabInitialState\(/);
assert.match(builtIns, /buildExportedScene\(/);
assert.match(builtIns, /roleIdByUnitId/);
assert.match(builtIns, /definition\.defaultProgram/);
assert.match(builtIns, /anchor: 'experiment_start'/);
assert.match(builtIns, /nextSourceStep\?\.command\.kind === 'cancel_fire'/);
assert.match(builtIns, /anchor: 'step_start'/);
assert.match(builtIns, /BUILT_IN_EXPORTED_AT/);
assert.match(builtIns, /deepFreeze\(/);
for (const scenarioId of [
  'rifle-distance-baseline',
  'rifle-moving-target',
  'ppsh-burst-recoil',
  'dp27-portable-deployed',
  'dp27-assistant-ammo',
  'wounds-first-aid',
  'suppression-events',
  'combat-save-load-boundaries',
]) assert.match(registry, new RegExp(scenarioId), `Missing built-in source scenario ${scenarioId}`);
assert.doesNotMatch(builtIns, /runCombatLabScenario\s*=|function runCombatLabScenario/, 'Existing runner must remain separate and intact.');
console.log('Combat Lab built-in experiments smoke passed.');
