import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REQUIRED_BASE_SHA = 'f93cdbdf15497498e99dd4f63a2bfd20e5414ea9';
const repoRoot = process.cwd();
const stage8VerifierPath = path.join(repoRoot, 'scripts', 'infantry_combat_stage8_verify.mjs');
const stage8RequiredFragments = [
  'combat-catalogs:smoke',
  'combat-catalog-storage:smoke',
  'combat-catalog-editor:smoke',
  'physical-action-coordinator:smoke',
  'posture-transition:smoke',
  'physical-movement:smoke',
  'perception:smoke',
  'infantry-combat-single-shot:smoke',
  'infantry-combat-projectile:smoke',
  'infantry-combat-projectile:benchmark',
  'infantry-combat-stage5:verify',
  'infantry-combat-stage6:verify',
  'infantry-combat-stage7:verify',
  'infantry-combat-stage8:smoke',
  'infantry-combat-stage8:forbidden-scan',
  'attention-ai-nodes:smoke',
  'contact-investigation:smoke',
  'node-contract-ui:smoke',
  'graph-v2:smoke',
  "['npm', ['run', 'typecheck']]",
  "['npm', ['run', 'build']]",
  "['git', ['diff', '--check'",
  'runPerformanceContractWithBaseComparison();',
  'verifyCleanTrackedTree();',
];

const checks = [
  ['npm', ['run', 'infantry-combat-stage8:verify']],
  ['npm', ['run', 'infantry-combat-stage5:forbidden-scan']],
  ['npm', ['run', 'infantry-combat-stage6:forbidden-scan']],
  ['npm', ['run', 'infantry-combat-stage7:forbidden-scan']],
  ['npm', ['run', 'infantry-combat-stage8:forbidden-scan']],
  ['npm', ['run', 'infantry-combat-stage9:smoke']],
  ['npm', ['run', 'infantry-combat-stage9:forbidden-scan']],
  ['node', ['--check', 'scripts/infantry_combat_stage9_smoke.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage9_forbidden_scan.mjs']],
  ['node', ['--check', 'scripts/infantry_combat_stage9_verify.mjs']],
  ['git', ['diff', '--check', `${REQUIRED_BASE_SHA}...HEAD`]],
];

console.log(`Node.js ${process.version}`);
ensureVerificationHistory();
verifyStage8MatrixContract();
for (const [command, args] of checks) runRequiredCheck(command, args);
verifyCleanTrackedTree();

console.log(
  `Stage 9 verification passed on Node.js ${process.version}: `
  + `${checks.length} executed commands, Stage 8 matrix source contract and clean tracked tree.`,
);

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
    fail(
      'Stage 9 verification history preparation failed',
      `Обязательный base SHA недоступен после fetch: ${REQUIRED_BASE_SHA}.\n${combinedOutput(base)}`,
    );
  }
  console.log(workflowAnnotation(
    'notice',
    'Stage 9 verification',
    `PASS full git history and required base ${REQUIRED_BASE_SHA} available`,
  ));
}

function verifyStage8MatrixContract() {
  const source = readFileSync(stage8VerifierPath, 'utf8');
  const missing = stage8RequiredFragments.filter((fragment) => !source.includes(fragment));
  if (missing.length > 0) {
    fail(
      'Stage 8 matrix source contract failed',
      `Stage 8 verifier is missing mandatory coverage fragments:\n${missing.map((item) => `- ${item}`).join('\n')}`,
    );
  }
  console.log(workflowAnnotation(
    'notice',
    'Stage 9 verification',
    'PASS Stage 8 matrix contract: catalogs, physical runtime, posture, movement, perception, projectile benchmark, Stage 5–8 verification, AI regressions, TypeScript, build, diff, performance and clean-tree gates are present.',
  ));
}

function runRequiredCheck(command, args) {
  const label = [command, ...args].join(' ');
  const result = run(command, args, repoRoot);
  const output = combinedOutput(result);
  if (result.error || result.status !== 0) {
    fail('Stage 9 verification failed', `FAIL ${label}\n${tail(output, 16000)}`);
  }
  console.log(workflowAnnotation(
    'notice',
    'Stage 9 verification',
    `PASS ${label}: ${lastMeaningfulLine(output) || 'completed without output'}`,
  ));
}

function verifyCleanTrackedTree() {
  const status = run('git', ['status', '--short'], repoRoot);
  const output = combinedOutput(status);
  if (status.error || status.status !== 0 || output.trim()) {
    fail('Stage 9 tracked-tree verification failed', `git status --short must be empty.\n${output}`);
  }
  console.log(workflowAnnotation(
    'notice',
    'Stage 9 verification',
    'PASS git status --short: tracked tree clean',
  ));
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

function lastMeaningfulLine(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? '';
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
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}
