import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [serialization, digest] = await Promise.all([
  readFile('src/core/testing/combat-lab/experiment/CombatLabExperimentSerialization.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabExperimentDigest.ts', 'utf8'),
]);
assert.match(serialization, /serializeCombatLabExperiment\(/);
assert.match(serialization, /parseCombatLabExperiment\(/);
assert.match(serialization, /JSON\.stringify\([^;]+, null, 2\)/s);
assert.match(serialization, /combat_lab_experiment_json_invalid/);
assert.match(serialization, /UI_ONLY_KEYS/);
assert.match(serialization, /Object\.keys\(value\)\.sort/);
assert.match(digest, /digestCombatLabExperiment\(/);
assert.match(digest, /digestStableValue\(/);
assert.match(digest, /semanticExperimentValue/);
assert.match(digest, /exportedAt: _exportedAt/);
assert.match(digest, /builtAtMs: _builtAtMs/);
assert.doesNotMatch(`${serialization}\n${digest}`, /Math\.random|Date\.now|new Date/);
console.log('Combat Lab experiment serialization smoke passed.');
