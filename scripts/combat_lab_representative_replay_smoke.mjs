import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const replay = await readFile('src/combat-lab/runtime/CombatLabRepresentativeRunReplay.ts', 'utf8');
assert.match(replay, /export function replayCombatLabRepresentativeRun/);
assert.match(replay, /controller\.stop\(\);[\s\S]*controller\.reset\(representative\.seed\);[\s\S]*controller\.setRepresentativeContext/);
assert.doesNotMatch(replay, /controller\.start\(/);
assert.match(replay, /runIndex/);
assert.match(replay, /stopReason/);
assert.match(replay, /eventDigest/);
assert.match(replay, /finalStateDigest/);
assert.match(replay, /must be a non-negative integer/);

console.log('Combat Lab representative replay smoke passed.');
