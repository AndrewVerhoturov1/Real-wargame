import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repository = 'AndrewVerhoturov1/Real-wargame';
const branch = '__EXACT_BRANCH__';
const sourceSha = '__EXACT_SOURCE_SHA__';

if (branch.startsWith('__') || sourceSha.startsWith('__')) {
  throw new Error('Exact-source fallback placeholders were not replaced.');
}
if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
  throw new Error(`Invalid exact source SHA: ${sourceSha}`);
}

const deploymentRoot = process.cwd();
const workingRoot = path.join(deploymentRoot, '.exact-source');
const sourceRoot = path.join(workingRoot, 'source');
const reportFile = path.join(workingRoot, 'preview-verification.json');
const outputRoot = path.join(deploymentRoot, 'dist');

rmSync(workingRoot, { recursive: true, force: true });
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(workingRoot, { recursive: true });

console.log(`[exact-source-fallback] repository=${repository}`);
console.log(`[exact-source-fallback] branch=${branch}`);
console.log(`[exact-source-fallback] source_sha=${sourceSha}`);
run('git', [
  'clone',
  '--branch', branch,
  '--single-branch',
  `https://github.com/${repository}.git`,
  sourceRoot,
], deploymentRoot);

const actualSha = capture('git', ['rev-parse', 'HEAD'], sourceRoot).trim();
if (actualSha !== sourceSha) {
  throw new Error(`Deployment source mismatch: expected ${sourceSha}, received ${actualSha}`);
}
console.log(`Verified deployment source: ${branch} @ ${actualSha}`);

run('npm', ['ci', '--no-audit', '--no-fund'], sourceRoot);
run('npm', ['run', 'verify:preview', '--', '--report', reportFile], sourceRoot);
run('npm', ['run', 'build:app'], sourceRoot, {
  REAL_WARGAME_BRANCH: branch,
  REAL_WARGAME_COMMIT_SHA: actualSha,
});
run('node', [
  'scripts/write_deployment_source.mjs',
  '--root', 'dist',
  '--ref', branch,
  '--sha', actualSha,
  '--report', reportFile,
], sourceRoot);
run('npm', ['run', 'verify:deployment-pages', '--', '--root', 'dist', '--require-source'], sourceRoot);

cpSync(path.join(sourceRoot, 'dist'), outputRoot, { recursive: true });
console.log(`[exact-source-fallback] build_complete source_sha=${actualSha}`);
console.log('[exact-source-fallback] output includes deployment-source.json');

function run(command, args, cwd, extraEnv = {}) {
  console.log(`[exact-source-fallback] run=${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${[command, ...args].join(' ')}`);
  }
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`Command failed with exit code ${result.status}: ${[command, ...args].join(' ')}`);
  }
  return result.stdout ?? '';
}
