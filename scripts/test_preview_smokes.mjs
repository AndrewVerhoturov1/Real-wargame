import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runIsolatedChecks } from './lib/isolated_process_runner.mjs';
import { createPreviewSmokeScenarios } from './preview_smoke_scenarios.mjs';

const reportPath = readReportPath(process.argv.slice(2));
const report = await runIsolatedChecks(createPreviewSmokeScenarios(), {
  failFast: true,
  streamOutput: true,
});

const payload = {
  schemaVersion: 1,
  status: report.passed ? 'passed' : 'failed',
  checks: report.results,
  skippedChecks: [],
};
if (reportPath) await writeReport(reportPath, payload);

if (!report.passed) {
  const failed = report.results.find((result) => result.status !== 'passed');
  console.error(`Preview smoke gate failed at: ${failed?.name ?? 'unknown scenario'}.`);
  process.exit(1);
}
console.log(`Preview smoke gate passed: ${report.results.length} isolated scenarios.`);

function readReportPath(args) {
  if (args.length === 0) return null;
  if (args.length !== 2 || args[0] !== '--report' || !args[1]) {
    console.error('Usage: node scripts/test_preview_smokes.mjs [--report <file>]');
    process.exit(1);
  }
  return path.resolve(args[1]);
}

async function writeReport(file, payload) {
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
}
