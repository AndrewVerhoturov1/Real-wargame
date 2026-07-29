import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [replay, extension, publicIndex] = await Promise.all([
  readFile('src/combat-lab/runtime/CombatLabRepresentativeRunReplay.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/index.ts', 'utf8'),
]);

assert.match(replay, /import type \{ CombatLabRepresentativeRunV1 \} from '\.\.\/\.\.\/core\/testing\/combat-lab\/experiment\/CombatLabBatchContracts'/);
assert.doesNotMatch(replay, /export interface CombatLabRepresentativeRunV1/, 'Temporary representative DTO must be removed.');
assert.match(replay, /controller\.stop\(\)/);
assert.match(replay, /controller\.reset\(representative\.seed\)/);
assert.match(replay, /controller\.setRepresentativeContext/);
assert.doesNotMatch(replay, /controller\.start\(\)/);
assert.match(extension, /onReplayRepresentative:\s*\(representative\)\s*=>/);
assert.match(extension, /replayCombatLabRepresentativeRun\(this\.visualController, representative\)/);
for (const moduleName of [
  'CombatLabExperimentRunner',
  'CombatLabBatchContracts',
  'CombatLabBatchStatistics',
  'CombatLabRepresentativeRuns',
  'CombatLabBatchRunner',
]) assert.match(publicIndex, new RegExp(`export \\* from './${moduleName}'`));

console.log('Combat Lab Stage 10 representative replay and public exports contract passed.');
