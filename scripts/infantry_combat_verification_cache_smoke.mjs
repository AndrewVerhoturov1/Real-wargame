import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runVerificationCommand } from './infantry_combat_verification_cache.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'real-wargame-verification-cache-smoke-'));
const cachePath = path.join(directory, 'verification-cache.json');
const counterPath = path.join(directory, 'counter.txt');
const workerPath = path.join(directory, 'increment-counter.mjs');
const previousCachePath = process.env.INFANTRY_COMBAT_VERIFICATION_CACHE;

writeFileSync(workerPath, [
  "import { readFileSync, writeFileSync } from 'node:fs';",
  "const counterPath = process.argv[2];",
  "let count = 0;",
  "try { count = Number(readFileSync(counterPath, 'utf8')) || 0; } catch {}",
  "writeFileSync(counterPath, String(count + 1));",
  "console.log(`counter=${count + 1}`);",
].join('\n'));

try {
  process.env.INFANTRY_COMBAT_VERIFICATION_CACHE = cachePath;

  const first = runVerificationCommand(process.execPath, [workerPath, counterPath], directory);
  assert.equal(first.status, 0);
  assert.equal(first.cached, false);
  assert.equal(readFileSync(counterPath, 'utf8'), '1');

  const repeated = runVerificationCommand(process.execPath, [workerPath, counterPath], directory);
  assert.equal(repeated.status, 0);
  assert.equal(repeated.cached, true);
  assert.equal(readFileSync(counterPath, 'utf8'), '1');

  const distinct = runVerificationCommand(process.execPath, [workerPath, counterPath, 'distinct-key'], directory);
  assert.equal(distinct.status, 0);
  assert.equal(distinct.cached, false);
  assert.equal(readFileSync(counterPath, 'utf8'), '2');
} finally {
  if (previousCachePath === undefined) delete process.env.INFANTRY_COMBAT_VERIFICATION_CACHE;
  else process.env.INFANTRY_COMBAT_VERIFICATION_CACHE = previousCachePath;
  rmSync(directory, { recursive: true, force: true });
}

console.log('Infantry combat verification cache smoke passed: successful identical commands execute once, distinct commands execute independently.');
