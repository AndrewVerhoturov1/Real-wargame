import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = await mkdtemp(path.join(os.tmpdir(), 'deployment-source-'));
try {
  const output = path.join(root, 'static');
  const report = path.join(root, 'report.json');
  await mkdir(output, { recursive: true });
  await writeFile(report, JSON.stringify({
    status: 'passed',
    checks: [
      { name: 'TypeScript', command: 'npm run typecheck', status: 'passed', durationMs: 12 },
    ],
    skippedChecks: [],
  }));

  const result = spawnSync(process.execPath, [
    'scripts/write_deployment_source.mjs',
    '--root', output,
    '--ref', 'feature/example',
    '--sha', '0123456789abcdef0123456789abcdef01234567',
    '--report', report,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const payload = JSON.parse(await readFile(path.join(output, 'deployment-source.json'), 'utf8'));
  assert.equal(payload.repository, 'AndrewVerhoturov1/Real-wargame');
  assert.equal(payload.ref, 'feature/example');
  assert.equal(payload.sourceSha, '0123456789abcdef0123456789abcdef01234567');
  assert.equal(payload.verificationStatus, 'passed');
  assert.deepEqual(payload.checks.map((check) => check.name), ['TypeScript']);
  assert.deepEqual(payload.skippedChecks, []);

  console.log('Deployment source writer contract passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
