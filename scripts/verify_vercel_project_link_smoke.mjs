import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = await mkdtemp(path.join(os.tmpdir(), 'vercel-link-'));
try {
  const valid = path.join(root, 'valid.json');
  const wrong = path.join(root, 'wrong.json');
  await writeFile(valid, JSON.stringify({ orgId: 'team_expected', projectId: 'prj_expected', projectName: 'repo' }));
  await writeFile(wrong, JSON.stringify({ orgId: 'team_other', projectId: 'prj_other', projectName: 'repo-test' }));

  const ok = run(valid);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /permanent project repo/);
  assert.doesNotMatch(ok.stdout + ok.stderr, /team_expected|prj_expected/);

  const bad = run(wrong);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /does not match the permanent Vercel project/);
  assert.doesNotMatch(bad.stdout + bad.stderr, /team_other|prj_other|team_expected|prj_expected/);

  console.log('Vercel project link contract passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}

function run(file) {
  return spawnSync(process.execPath, [
    'scripts/verify_vercel_project_link.mjs',
    '--file', file,
    '--expected-org-id', 'team_expected',
    '--expected-project-id', 'prj_expected',
    '--expected-project-name', 'repo',
  ], { cwd: process.cwd(), encoding: 'utf8' });
}
