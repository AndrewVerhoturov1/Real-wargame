import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REQUIRED_BASE_SHA = '8a08eb43c7fe93fd1343ad2a1c1a21df248fea1c';
const repoRoot = process.cwd();
const baseWorktree = path.join(repoRoot, '.tmp-stage6-performance-base');

const checksBeforePerformance = [
  ['npm', ['run', 'combat-catalogs:smoke']],
  ['npm', ['run', 'combat-catalog-storage:smoke']],
  ['npm', ['run', 'combat-catalog-editor:smoke']],
  ['npm', ['run', 'physical-action-coordinator:smoke']],
  ['npm', ['run', 'posture-transition:smoke']],
  ['npm', ['run', 'physical-movement:smoke']],
  ['npm', ['run', 'perception:smoke']],
  ['npm', ['run', 'infantry-combat-single-shot:smoke']],
  ['npm', ['run', 'infantry-combat-projectile:smoke']],
  ['npm', ['run', 'infantry-combat-projectile:benchmark']],
  ['npm', ['run', 'infantry-combat-stage5:smoke']],
  ['npm', ['run', 'infantry-combat-stage5:forbidden-scan']],
  ['npm', ['run', 'infantry-combat-stage6:smoke']],
  ['npm', ['run', 'infantry-combat-stage6:forbidden-scan']],
];

const checksAfterPerformance = [
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'build']],
  ['node', ['--check', 'scripts/infantry_combat_stage6_smoke.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage6_forbidden_scan.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage6_verify.mjs']],
];

console.log(`Node.js ${process.version}`);
for (const [command, args] of checksBeforePerformance) runRequiredCheck(command, args);
runPerformanceContractWithBaseComparison();
for (const [command, args] of checksAfterPerformance) runRequiredCheck(command, args);
console.log(`Stage 6 verification PASS on ${process.version}: 20 required non-browser commands; performance-contract is accepted only when successful or identical to mandatory base ${REQUIRED_BASE_SHA}.`);

function runRequiredCheck(command, args) {
  const label = [command, ...args].join(' ');
  const result = run(command, args, repoRoot);
  const output = combinedOutput(result);
  if (result.error || result.status !== 0) fail(`FAIL ${label}`, output);
  console.log(`PASS ${label}: ${lastMeaningfulLine(output) || 'completed without output'}`);
}

function runPerformanceContractWithBaseComparison() {
  const label = 'npm run performance-contract:smoke';
  const current = run('npm', ['run', 'performance-contract:smoke'], repoRoot);
  const currentOutput = combinedOutput(current);
  if (!current.error && current.status === 0) {
    console.log(`PASS ${label}`);
    return;
  }

  const fetch = run('git', ['fetch', '--no-tags', '--depth=1', 'origin', REQUIRED_BASE_SHA], repoRoot);
  if (fetch.error || fetch.status !== 0) {
    fail(
      'FAIL Stage 6 performance baseline fetch',
      `Не удалось получить обязательный base SHA ${REQUIRED_BASE_SHA}.\n${combinedOutput(fetch)}`,
    );
  }

  rmSync(baseWorktree, { recursive: true, force: true });
  const addWorktree = run('git', ['worktree', 'add', '--detach', baseWorktree, REQUIRED_BASE_SHA], repoRoot);
  if (addWorktree.error || addWorktree.status !== 0) {
    fail('FAIL Stage 6 performance baseline worktree', combinedOutput(addWorktree));
  }

  let baseline;
  try {
    baseline = run('npm', ['run', 'performance-contract:smoke'], baseWorktree);
  } finally {
    run('git', ['worktree', 'remove', '--force', baseWorktree], repoRoot);
    rmSync(baseWorktree, { recursive: true, force: true });
  }

  const baselineOutput = combinedOutput(baseline);
  const currentSignature = failureSignature(currentOutput);
  const baselineSignature = failureSignature(baselineOutput);
  if (baseline.status !== 0 && currentSignature && currentSignature === baselineSignature) {
    console.warn([
      `KNOWN BASE FAILURE ${label}`,
      `mandatory base: ${REQUIRED_BASE_SHA}`,
      `current status: ${current.status}`,
      `base status: ${baseline.status}`,
      `signature: ${currentSignature}`,
    ].join('\n'));
    return;
  }

  fail(
    'FAIL Stage 6 performance baseline comparison',
    [
      'Обнаружено новое или отличающееся падение performance-contract:smoke.',
      `current status: ${current.status}`,
      `base status: ${baseline.status}`,
      `current signature: ${currentSignature}`,
      `base signature: ${baselineSignature}`,
      '',
      'CURRENT:',
      tail(currentOutput, 4000),
      '',
      'BASE:',
      tail(baselineOutput, 4000),
    ].join('\n'),
  );
}

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
}

function combinedOutput(result) {
  return [result.error ? String(result.error) : '', result.stdout ?? '', result.stderr ?? '']
    .filter(Boolean)
    .join('\n')
    .trim();
}

function failureSignature(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => line.includes('must include mandatory performance contract fragment:'))
    ?? lines.find((line) => line.startsWith('Error:'))
    ?? lines.at(-1)
    ?? '';
}

function lastMeaningfulLine(value) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? '';
}

function tail(value, maximumCharacters) {
  return value.length <= maximumCharacters ? value : value.slice(-maximumCharacters);
}

function fail(title, output) {
  console.error(`${title}\n${tail(output, 12000)}`);
  process.exit(1);
}
