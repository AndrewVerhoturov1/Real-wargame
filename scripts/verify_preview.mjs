import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runIsolatedChecks } from './lib/isolated_process_runner.mjs';
import { createPreviewSmokeScenarios } from './preview_smoke_scenarios.mjs';

const options = parseArgs(process.argv.slice(2));
const reportPath = path.resolve(required(options, 'report'));
const skipPreviewSmokes = options['skip-preview-smokes'] === true;
const skipReason = options['skip-reason'] ?? '';

if (skipPreviewSmokes && !skipReason.trim()) fail('--skip-preview-smokes requires a non-empty --skip-reason.');
if (!skipPreviewSmokes && skipReason) fail('--skip-reason is valid only with --skip-preview-smokes.');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const root = process.cwd();
const previewSmokes = createPreviewSmokeScenarios(root);
const checks = [
  { name: 'TypeScript', command: npm, args: ['run', 'typecheck'], timeoutMs: 300_000 },
  nodeCheck('isolated process runner contract', 'isolated_process_runner_smoke.mjs', 30_000),
  nodeCheck('Preview verification contract', 'verify_preview_contract_smoke.mjs', 30_000),
  nodeCheck('Preview deployment configuration contract', 'preview_deployment_config_smoke.mjs', 30_000),
  nodeCheck('Vercel project link contract', 'verify_vercel_project_link_smoke.mjs', 30_000),
  nodeCheck('deployment source contract', 'write_deployment_source_smoke.mjs', 30_000),
  nodeCheck('deployment pages contract', 'deployment_pages_smoke_contract.mjs', 30_000),
  nodeCheck('manual Vercel policy contract', 'manual_vercel_deploy_skill_smoke.mjs', 30_000),
  nodeCheck('manual Vercel workflow contract', 'manual_vercel_preview_workflow_smoke.mjs', 30_000),
  ...(skipPreviewSmokes ? [] : previewSmokes),
];
const skippedChecks = skipPreviewSmokes
  ? previewSmokes.map(({ name, command, args }) => ({
    name,
    command: [command, ...args].map((part) => JSON.stringify(String(part))).join(' '),
    reason: skipReason.trim(),
  }))
  : [];

const report = await runIsolatedChecks(checks, { failFast: true, streamOutput: true });
const payload = {
  schemaVersion: 1,
  status: report.passed ? (skipPreviewSmokes ? 'passed_with_skips' : 'passed') : 'failed',
  checks: report.results,
  skippedChecks,
};
await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`);

if (!report.passed) {
  const failed = report.results.find((result) => result.status !== 'passed');
  console.error(`Preview verification gate failed at: ${failed?.name ?? 'unknown check'}.`);
  process.exit(1);
}
if (skipPreviewSmokes) {
  console.warn(`Preview verification gate passed with ${skippedChecks.length} explicitly skipped smoke scenarios.`);
} else {
  console.log(`Preview verification gate passed: ${report.results.length} isolated checks.`);
}

function nodeCheck(name, filename, timeoutMs) {
  return {
    name,
    command: process.execPath,
    args: [path.join(root, 'scripts', filename)],
    cwd: root,
    timeoutMs,
  };
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--skip-preview-smokes') {
      result['skip-preview-smokes'] = true;
      continue;
    }
    if (token === '--report' || token === '--skip-reason') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) fail(`Missing value for ${token}.`);
      result[token.slice(2)] = value;
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${token}`);
  }
  return result;
}

function required(optionsObject, name) {
  const value = optionsObject[name];
  if (!value) fail(`Missing required argument --${name}.`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
