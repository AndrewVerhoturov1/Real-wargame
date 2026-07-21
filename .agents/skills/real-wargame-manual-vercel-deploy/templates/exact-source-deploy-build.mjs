import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repository = 'AndrewVerhoturov1/Real-wargame';
const branch = '__EXACT_BRANCH__';
const sourceSha = '__EXACT_SOURCE_SHA__';

// Replace this list in the ephemeral deployment copy with the smallest sufficient
// checks for the changed subsystems. Use argument arrays; never interpolate shell text.
const focusedChecks = [
  // { command: 'npm', args: ['run', 'example:smoke'] },
];

if (branch.startsWith('__') || sourceSha.startsWith('__')) {
  throw new Error('Exact-source bootstrap placeholders were not replaced.');
}
if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
  throw new Error(`Invalid exact source SHA: ${sourceSha}`);
}

const deploymentRoot = process.cwd();
const workingRoot = path.join(deploymentRoot, '.exact-source');
const sourceRoot = path.join(workingRoot, 'source');
const outputRoot = path.join(deploymentRoot, 'dist');

rmSync(workingRoot, { recursive: true, force: true });
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(workingRoot, { recursive: true });

console.log(`[exact-source] repository=${repository}`);
console.log(`[exact-source] branch=${branch}`);
console.log(`[exact-source] source_sha=${sourceSha}`);
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
run('npx', ['tsc', '--noEmit'], sourceRoot);
for (const check of focusedChecks) run(check.command, check.args, sourceRoot);
run('npx', ['vite', 'build'], sourceRoot);
run('npm', ['run', 'deployment-pages:smoke'], sourceRoot);

cpSync(path.join(sourceRoot, 'dist'), outputRoot, { recursive: true });
writeFileSync(path.join(outputRoot, 'deployment-source.json'), `${JSON.stringify({
  repository,
  branch,
  sourceSha: actualSha,
  checks: [
    'npx tsc --noEmit',
    ...focusedChecks.map(({ command, args }) => [command, ...args].join(' ')),
    'npx vite build',
    'npm run deployment-pages:smoke',
  ],
}, null, 2)}\n`);
console.log(`[exact-source] build_complete source_sha=${actualSha}`);

function run(command, args, cwd) {
  console.log(`[exact-source] run=${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: process.env,
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
