import { rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REQUIRED_BASE_SHA = '6e719225d8da711fbf2d1963baa43bcd03c7dbdf';
const repoRoot = process.cwd();
const baseWorktree = path.join(repoRoot, '.tmp-stage5-performance-base');
const checks = [
  ['npm', ['run', 'infantry-combat-stage5:smoke']],
  ['npm', ['run', 'infantry-combat-single-shot:smoke']],
  ['npm', ['run', 'infantry-combat-projectile:smoke']],
  ['npm', ['run', 'infantry-combat-projectile:benchmark']],
  ['npm', ['run', 'combat-catalogs:smoke']],
  ['npm', ['run', 'physical-action-coordinator:smoke']],
  ['npm', ['run', 'posture-transition:smoke']],
  ['npm', ['run', 'physical-movement:smoke']],
  ['npm', ['run', 'perception:smoke']],
];

console.log(`Node.js ${process.version}`);
for (const [command, args] of checks) runRequiredCheck(command, args);
runPerformanceContractWithBaseComparison();
runRequiredCheck('npm', ['run', 'infantry-combat-stage5:forbidden-scan']);

console.log(`Stage 5 verification passed on Node.js ${process.version}: 11 required non-browser commands; the performance-contract result is accepted only as an identical mandatory-base failure.`);

function runRequiredCheck(command, args) {
  const label = [command, ...args].join(' ');
  const result = run(command, args, repoRoot);
  const output = combinedOutput(result);
  if (result.error || result.status !== 0) {
    fail('Stage 5 verification failed', `FAIL ${label}\n${tail(output, 5000)}`);
  }
  console.log(workflowAnnotation(
    'notice',
    'Stage 5 verification',
    `PASS ${label}: ${lastMeaningfulLine(output) || 'completed without output'}`,
  ));
}

function runPerformanceContractWithBaseComparison() {
  const label = 'npm run performance-contract:smoke';
  const current = run('npm', ['run', 'performance-contract:smoke'], repoRoot);
  const currentOutput = combinedOutput(current);
  if (!current.error && current.status === 0) {
    console.log(workflowAnnotation('notice', 'Stage 5 verification', `PASS ${label}`));
    return;
  }

  const fetch = run('git', ['fetch', '--no-tags', '--depth=1', 'origin', REQUIRED_BASE_SHA], repoRoot);
  if (fetch.error || fetch.status !== 0) {
    fail('Stage 5 performance baseline comparison failed', `Не удалось получить обязательный base SHA ${REQUIRED_BASE_SHA}.\n${combinedOutput(fetch)}`);
  }

  rmSync(baseWorktree, { recursive: true, force: true });
  const addWorktree = run('git', ['worktree', 'add', '--detach', baseWorktree, REQUIRED_BASE_SHA], repoRoot);
  if (addWorktree.error || addWorktree.status !== 0) {
    fail('Stage 5 performance baseline comparison failed', `Не удалось создать detached worktree обязательной базы.\n${combinedOutput(addWorktree)}`);
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
    console.log(workflowAnnotation(
      'warning',
      'Known base performance-contract failure',
      [
        `Stage 5 воспроизводит идентичное падение обязательной базы ${REQUIRED_BASE_SHA}.`,
        `current status: ${current.status}`,
        `base status: ${baseline.status}`,
        `signature: ${currentSignature}`,
      ].join('\n'),
    ));
    return;
  }

  fail(
    'Stage 5 performance baseline comparison failed',
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
    maxBuffer: 32 * 1024 * 1024,
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

function fail(title, message) {
  console.error(workflowAnnotation('error', title, message));
  process.exit(1);
}

function workflowAnnotation(level, title, message) {
  return `::${level} file=package.json,line=1,title=${escapeData(title)}::${escapeData(message)}`;
}

function escapeData(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}
