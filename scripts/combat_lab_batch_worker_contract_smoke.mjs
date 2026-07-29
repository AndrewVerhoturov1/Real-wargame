import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [contracts, worker, client] = await Promise.all([
  readFile('src/core/testing/combat-lab/experiment/CombatLabBatchContracts.ts', 'utf8'),
  readFile('src/combat-lab/workers/combat-lab-batch.worker.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabBatchClient.ts', 'utf8'),
]);
for (const kind of ['start', 'cancel', 'progress', 'complete', 'cancelled', 'error']) assert.match(contracts, new RegExp(`kind: '${kind}'`));
assert.match(contracts, /COMBAT_LAB_BATCH_WORKER_PROTOCOL_VERSION = 1/);
assert.match(worker, /setTimeout\(runNextChunk, 0\)/);
assert.match(worker, /runCombatLabBatchPartition/);
assert.match(worker, /chunkSize/);
assert.match(client, /new Worker\(new URL\('\.\.\/workers\/combat-lab-batch\.worker\.ts', import\.meta\.url\),\s*\{\s*type: 'module',?\s*\}\)/s,
  'Vite must receive statically analyzable Worker options.');
assert.doesNotMatch(client, /new Worker\([\s\S]*?name:\s*`/,
  'Dynamic template literals must not return inside Vite Worker options.');
assert.match(client, /Math\.min\(4, Math\.max\(1/);
assert.match(client, /batchRunId[\s\S]*experimentRevision[\s\S]*sourceDigest/);
assert.match(client, /PROGRESS_INTERVAL_MS = 100/);
assert.match(client, /worker\.terminate\(\)/);
assert.match(client, /destroy\(\): void/);
assert.doesNotMatch(contracts + worker + client, /SharedArrayBuffer/);
assert.doesNotMatch(worker + client, /SimulationState/);
console.log('Combat Lab batch worker contract smoke passed.');
