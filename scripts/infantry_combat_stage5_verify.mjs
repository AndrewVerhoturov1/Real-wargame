import { rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REQUIRED_BASE_SHA = '6e719225d8da711fbf2d1963baa43bcd03c7dbdf';
const repoRoot = process.cwd();
const baseWorktree = path.join(repoRoot, '.tmp-stage5-performance-base');

const current = run(process.execPath, ['scripts/performance_principles_contract_smoke.mjs'], repoRoot);
if (current.status === 0 && !current.error) {
  console.log(workflowAnnotation('notice', 'Stage 5 performance baseline', 'PASS current performance-contract:smoke'));
  process.exit(0);
}

const fetch = run('git', ['fetch', '--no-tags', '--depth=1', 'origin', REQUIRED_BASE_SHA], repoRoot);
if (fetch.status !== 0 || fetch.error) {
  fail(`Не удалось получить обязательный base SHA ${REQUIRED_BASE_SHA}.\n${combinedOutput(fetch)}`);
}

rmSync(baseWorktree, { recursive: true, force: true });
const addWorktree = run('git', ['worktree', 'add', '--detach', baseWorktree, REQUIRED_BASE_SHA], repoRoot);
if (addWorktree.status !== 0 || addWorktree.error) {
  fail(`Не удалось создать detached worktree обязательной базы.\n${combinedOutput(addWorktree)}`);
}

let baseline;
try {
  baseline = run(process.execPath, ['scripts/performance_principles_contract_smoke.mjs'], baseWorktree);
} finally {
  run('git', ['worktree', 'remove', '--force', baseWorktree], repoRoot);
  rmSync(baseWorktree, { recursive: true, force: true });
}

const currentSignature = failureSignature(combinedOutput(current));
const baselineSignature = failureSignature(combinedOutput(baseline));
const diagnostic = [
  `current status: ${current.status}`,
  `base status: ${baseline.status}`,
  `current signature: ${currentSignature}`,
  `base signature: ${baselineSignature}`,
].join('\n');

if (baseline.status !== 0 && currentSignature && currentSignature === baselineSignature) {
  console.log(workflowAnnotation(
    'warning',
    'Known base performance-contract failure',
    `Stage 5 воспроизводит идентичное падение обязательной базы ${REQUIRED_BASE_SHA}.\n${diagnostic}`,
  ));
  process.exit(0);
}

fail(`Обнаружено новое или отличающееся падение performance-contract:smoke.\n${diagnostic}\n\nCURRENT:\n${tail(combinedOutput(current), 4000)}\n\nBASE:\n${tail(combinedOutput(baseline), 4000)}`);

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

function fail(message) {
  console.error(workflowAnnotation('error', 'Stage 5 performance baseline comparison failed', message));
  process.exit(1);
}

function tail(value, maximumCharacters) {
  return value.length <= maximumCharacters ? value : value.slice(-maximumCharacters);
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
