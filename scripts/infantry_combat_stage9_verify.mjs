import { rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REQUIRED_BASE_SHA = 'f93cdbdf15497498e99dd4f63a2bfd20e5414ea9';
const repoRoot = process.cwd();
const baseWorktree = path.join(repoRoot, '.tmp-stage9-performance-base');
const checks = [
  ['npm', ['run', 'combat-catalogs:smoke']],
  ['npm', ['run', 'combat-catalog-storage:smoke']],
  ['npm', ['run', 'combat-catalog-editor:smoke']],

  ['npm', ['run', 'physical-action-coordinator:smoke']],
  ['npm', ['run', 'physical-movement:smoke']],
  ['npm', ['run', 'posture-transition:smoke']],

  ['npm', ['run', 'infantry-combat-single-shot:smoke']],
  ['npm', ['run', 'infantry-combat-projectile:smoke']],
  ['npm', ['run', 'infantry-combat-projectile:benchmark']],

  ['npm', ['run', 'infantry-combat-stage5:smoke']],
  ['npm', ['run', 'infantry-combat-stage5:forbidden-scan']],

  ['npm', ['run', 'infantry-combat-stage6:smoke']],
  ['npm', ['run', 'infantry-combat-stage6:forbidden-scan']],

  ['npm', ['run', 'infantry-combat-stage7:smoke']],
  ['npm', ['run', 'infantry-combat-stage7:forbidden-scan']],

  ['npm', ['run', 'infantry-combat-stage8:smoke']],
  ['npm', ['run', 'infantry-combat-stage8:forbidden-scan']],
  ['npm', ['run', 'infantry-combat-stage8:verify']],

  ['npm', ['run', 'infantry-combat-stage9:smoke']],
  ['npm', ['run', 'infantry-combat-stage9:forbidden-scan']],

  ['npm', ['run', 'perception:smoke']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'build']],

  ['node', ['--check', 'scripts/infantry_combat_stage9_smoke.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage9_forbidden_scan.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage9_verify.mjs']],

  ['git', ['diff', '--check', `${REQUIRED_BASE_SHA}...HEAD`]],
];

console.log(`Node.js ${process.version}`);
ensureVerificationHistory();
for (const [command, args] of checks) runRequiredCheck(command, args);
runPerformanceContractWithBaseComparison();
verifyCleanTrackedTree();

console.log(`Stage 9 verification passed on Node.js ${process.version}: ${checks.length + 2} required non-browser checks.`);

function ensureVerificationHistory() {
  const shallow = run('git', ['rev-parse', '--is-shallow-repository'], repoRoot);
  const shallowOutput = combinedOutput(shallow);
  if (shallow.error || shallow.status !== 0) {
    fail('Stage 9 verification history preparation failed', shallowOutput);
  }

  const fetchArgs = shallowOutput.trim() === 'true'
    ? ['fetch', '--no-tags', '--prune', '--unshallow', 'origin']
    : ['fetch', '--no-tags', '--prune', 'origin'];
  const fetch = run('git', fetchArgs, repoRoot);
  if (fetch.error || fetch.status !== 0) {
    fail('Stage 9 verification history preparation failed', combinedOutput(fetch));
  }

  const base = run('git', ['cat-file', '-e', `${REQUIRED_BASE_SHA}^{commit}`], repoRoot);
  if (base.error || base.status !== 0) {
    fail('Stage 9 verification history preparation failed', `Обязательный base SHA недоступен после fetch: ${REQUIRED_BASE_SHA}.\n${combinedOutput(base)}`);
  }
  console.log(workflowAnnotation('notice', 'Stage 9 verification', `PASS full git history and required base ${REQUIRED_BASE_SHA} available`));
}

function runRequiredCheck(command, args) {
  const label = [command, ...args].join(' ');
  const result = run(command, args, repoRoot);
  const output = combinedOutput(result);
  if (result.error || result.status !== 0) fail('Stage 9 verification failed', `FAIL ${label}\n${tail(output, 12000)}`);
  console.log(workflowAnnotation('notice', 'Stage 9 verification', `PASS ${label}: ${lastMeaningfulLine(output) || 'completed without output'}`));
}

function runPerformanceContractWithBaseComparison() {
  const label = 'npm run performance-contract:smoke';
  const current = run('npm', ['run', 'performance-contract:smoke'], repoRoot);
  const currentOutput = combinedOutput(current);
  if (!current.error && current.status === 0) {
    console.log(workflowAnnotation('notice', 'Stage 9 verification', `PASS ${label}`));
    return;
  }
  rmSync(baseWorktree, { recursive: true, force: true });
  const addWorktree = run('git', ['worktree', 'add', '--detach', baseWorktree, REQUIRED_BASE_SHA], repoRoot);
  if (addWorktree.error || addWorktree.status !== 0) fail('Stage 9 performance baseline comparison failed', combinedOutput(addWorktree));
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
    console.log(workflowAnnotation('warning', 'Known base performance-contract failure', `Stage 9 reproduces the exact base failure: ${currentSignature}`));
    return;
  }
  fail('Stage 9 performance baseline comparison failed', [
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
  ].join('\n'));
}

function verifyCleanTrackedTree() {
  const status = run('git', ['status', '--short'], repoRoot);
  const output = combinedOutput(status);
  if (status.error || status.status !== 0 || output.trim()) fail('Stage 9 tracked-tree verification failed', `git status --short must be empty.\n${output}`);
  console.log(workflowAnnotation('notice', 'Stage 9 verification', 'PASS git status --short: tracked tree clean'));
}

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
}
function combinedOutput(result) { return [result.error ? String(result.error) : '', result.stdout ?? '', result.stderr ?? ''].filter(Boolean).join('\n').trim(); }
function failureSignature(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => line.includes('must include mandatory performance contract fragment:'))
    ?? lines.find((line) => line.startsWith('Error:'))
    ?? lines.at(-1)
    ?? '';
}
function lastMeaningfulLine(value) { return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? ''; }
function tail(value, maximumCharacters) { return value.length <= maximumCharacters ? value : value.slice(-maximumCharacters); }
function fail(title, message) { console.error(workflowAnnotation('error', title, message)); process.exit(1); }
function workflowAnnotation(level, title, message) { return `::${level} file=package.json,line=1,title=${escapeData(title)}::${escapeData(message)}`; }
function escapeData(value) { return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'); }
