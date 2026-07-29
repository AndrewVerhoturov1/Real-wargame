import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runVerificationCommand } from './infantry_combat_verification_cache.mjs';

const REQUIRED_BASE_SHA = 'f7eea38163be07c70d83314b5b6f3a1ae1cb5855';
const repoRoot = process.cwd();
const baseWorktree = path.join(repoRoot, '.tmp-stage8-performance-base');
const verificationCachePath = path.join(
  tmpdir(),
  `real-wargame-infantry-verification-${process.pid}.json`,
);
const preflightChecks = [
  ['npm', ['run', 'node-contract-ui:smoke']],
  ['npm', ['run', 'graph-v2:smoke']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'build']],
  ['node', ['--check', 'scripts/infantry_combat_stage8_smoke.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage8_forbidden_scan.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage8_verify.mjs']],
  ['git', ['diff', '--check', `${REQUIRED_BASE_SHA}...HEAD`]],
];
const matrixChecks = [
  ['node', ['scripts/infantry_combat_verification_cache_smoke.mjs']],
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
  ['npm', ['run', 'infantry-combat-stage5:verify']],
  ['npm', ['run', 'infantry-combat-stage6:verify']],
  ['npm', ['run', 'infantry-combat-stage7:verify']],
  ['npm', ['run', 'infantry-combat-stage8:smoke']],
  ['npm', ['run', 'infantry-combat-stage8:forbidden-scan']],
  ['npm', ['run', 'attention-ai-nodes:smoke']],
  ['npm', ['run', 'contact-investigation:smoke']],
];

const previousCachePath = process.env.INFANTRY_COMBAT_VERIFICATION_CACHE;
rmSync(verificationCachePath, { force: true });
process.env.INFANTRY_COMBAT_VERIFICATION_CACHE = verificationCachePath;

try {
  console.log(`Node.js ${process.version}`);
  for (const [command, args] of preflightChecks) runRequiredCheck(command, args);
  runPerformanceContractWithBaseComparison();
  for (const [command, args] of matrixChecks) runRequiredCheck(command, args);
  verifyCleanTrackedTree();

  console.log(`Stage 8 verification passed on Node.js ${process.version}: ${preflightChecks.length + matrixChecks.length + 2} required non-browser checks; successful identical commands were executed once within this exact-head job, and performance-contract is accepted only when green or identical to the approved base failure.`);
} finally {
  rmSync(verificationCachePath, { force: true });
  if (previousCachePath === undefined) delete process.env.INFANTRY_COMBAT_VERIFICATION_CACHE;
  else process.env.INFANTRY_COMBAT_VERIFICATION_CACHE = previousCachePath;
}

function runRequiredCheck(command, args) {
  const label = [command, ...args].join(' ');
  const result = runVerificationCommand(command, args, repoRoot);
  const output = combinedOutput(result);
  if (result.error || result.status !== 0) {
    const signature = nestedFailureSignature(output);
    console.error(`FAILED_COMMAND=${label}`);
    fail(
      'Stage 8 verification failed',
      [
        `FAIL ${label}`,
        signature ? `NESTED_FAILURE_SIGNATURE ${signature}` : '',
        tail(output, 2500),
      ].filter(Boolean).join('\n'),
    );
  }
  console.log(workflowAnnotation(
    'notice',
    'Stage 8 verification',
    `PASS ${label}: ${lastMeaningfulLine(output) || 'completed without output'}`,
  ));
}

function runPerformanceContractWithBaseComparison() {
  const label = 'npm run performance-contract:smoke';
  const current = runVerificationCommand('npm', ['run', 'performance-contract:smoke'], repoRoot);
  const currentOutput = combinedOutput(current);
  if (!current.error && current.status === 0) {
    console.log(workflowAnnotation('notice', 'Stage 8 verification', `PASS ${label}`));
    return;
  }

  const fetch = run('git', ['fetch', '--no-tags', '--depth=1', 'origin', REQUIRED_BASE_SHA], repoRoot);
  if (fetch.error || fetch.status !== 0) {
    console.error(`FAILED_COMMAND=${label}`);
    fail('Stage 8 performance baseline comparison failed', `Не удалось получить обязательный base SHA ${REQUIRED_BASE_SHA}.\n${combinedOutput(fetch)}`);
  }

  rmSync(baseWorktree, { recursive: true, force: true });
  const addWorktree = run('git', ['worktree', 'add', '--detach', baseWorktree, REQUIRED_BASE_SHA], repoRoot);
  if (addWorktree.error || addWorktree.status !== 0) {
    console.error(`FAILED_COMMAND=${label}`);
    fail('Stage 8 performance baseline comparison failed', `Не удалось создать detached worktree обязательной базы.\n${combinedOutput(addWorktree)}`);
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
        `Stage 8 воспроизводит идентичное падение разрешённой базы ${REQUIRED_BASE_SHA}.`,
        `current status: ${current.status}`,
        `base status: ${baseline.status}`,
        `signature: ${currentSignature}`,
      ].join('\n'),
    ));
    return;
  }

  console.error(`FAILED_COMMAND=${label}`);
  fail(
    'Stage 8 performance baseline comparison failed',
    [
      'Обнаружено новое или отличающееся падение performance-contract:smoke.',
      `current status: ${current.status}`,
      `base status: ${baseline.status}`,
      `current signature: ${currentSignature}`,
      `base signature: ${baselineSignature}`,
      '',
      'CURRENT:',
      tail(currentOutput, 5000),
      '',
      'BASE:',
      tail(baselineOutput, 5000),
    ].join('\n'),
  );
}

function verifyCleanTrackedTree() {
  const status = run('git', ['status', '--short'], repoRoot);
  const output = combinedOutput(status);
  if (status.error || status.status !== 0 || output.trim()) {
    console.error('FAILED_COMMAND=git status --short');
    fail('Stage 8 tracked-tree verification failed', `git status --short must be empty.\n${output}`);
  }
  console.log(workflowAnnotation('notice', 'Stage 8 verification', 'PASS git status --short: tracked tree clean'));
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
    .filter(Boolean).join('\n').trim();
}
function nestedFailureSignature(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.findLast((line) => line.includes('FAILED_COMMAND='))
    ?? lines.findLast((line) => line.startsWith('FAIL '))
    ?? failureSignature(output);
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
function tail(value, maximumCharacters) { return value.length <= maximumCharacters ? value : value.slice(-maximumCharacters); }
function fail(title, message) { console.error(workflowAnnotation('error', title, message)); process.exit(1); }
function workflowAnnotation(level, title, message) { return `::${level} file=package.json,line=1,title=${escapeData(title)}::${escapeData(message)}`; }
function escapeData(value) { return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'); }
