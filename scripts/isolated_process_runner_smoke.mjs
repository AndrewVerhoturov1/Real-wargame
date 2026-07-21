import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { runIsolatedChecks } from './lib/isolated_process_runner.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'isolated-runner-'));
try {
  const passFile = path.join(root, 'pass.mjs');
  const failFile = path.join(root, 'fail.mjs');
  const hangFile = path.join(root, 'hang.mjs');

  await writeFile(passFile, "console.log('pass stdout'); console.error('pass stderr');\n");
  await writeFile(failFile, "console.log('fail stdout'); console.error('fail stderr'); process.exit(3);\n");
  await writeFile(hangFile, "console.log('printed passed but still alive'); setInterval(() => {}, 10);\n");

  const report = await runIsolatedChecks([
    { name: 'passing scenario', command: process.execPath, args: [passFile], timeoutMs: 2_000 },
    { name: 'failing scenario', command: process.execPath, args: [failFile], timeoutMs: 2_000 },
    { name: 'hanging scenario', command: process.execPath, args: [hangFile], timeoutMs: 150 },
  ], { failFast: false, streamOutput: false });

  assert.equal(report.passed, false);
  assert.equal(report.results[0].status, 'passed');
  assert.match(report.results[0].stdout, /pass stdout/);
  assert.match(report.results[0].stderr, /pass stderr/);

  assert.equal(report.results[1].status, 'failed');
  assert.equal(report.results[1].exitCode, 3);
  assert.match(report.results[1].stdout, /fail stdout/);
  assert.match(report.results[1].stderr, /fail stderr/);

  assert.equal(report.results[2].status, 'timed_out');
  assert.equal(report.results[2].exitCode, 124);
  assert.match(report.results[2].stdout, /printed passed but still alive/);
  assert.match(report.results[2].error, /hanging scenario/);

  console.log('Isolated process runner contract passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
