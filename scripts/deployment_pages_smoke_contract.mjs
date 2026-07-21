import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = await mkdtemp(path.join(os.tmpdir(), 'deployment-pages-'));
try {
  await writeFile(path.join(root, 'index.html'), '<!doctype html>');
  await writeFile(path.join(root, 'ai-node-editor.html'), '<!doctype html>');

  const missingSource = run(root);
  assert.notEqual(missingSource.status, 0);
  assert.match(missingSource.stderr, /deployment-source\.json/);

  await writeFile(path.join(root, 'deployment-source.json'), JSON.stringify({
    sourceSha: '0123456789abcdef0123456789abcdef01234567',
    checks: [],
    skippedChecks: [],
  }));
  const ok = run(root);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /index\.html, ai-node-editor\.html, deployment-source\.json/);

  console.log('Deployment pages contract passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}

function run(root) {
  return spawnSync(process.execPath, [
    'scripts/deployment_pages_smoke.mjs',
    '--root', root,
    '--require-source',
  ], { cwd: process.cwd(), encoding: 'utf8' });
}
