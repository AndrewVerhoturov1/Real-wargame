import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const options = parseArgs(process.argv.slice(2));
const root = path.resolve(required(options, 'root'));
const ref = required(options, 'ref').trim();
const sourceSha = required(options, 'sha').trim().toLowerCase();
const reportFile = path.resolve(required(options, 'report'));

if (!/^[0-9a-f]{40}$/.test(sourceSha)) fail('Deployment source SHA must be a 40-character hexadecimal commit SHA.');

let report;
try {
  report = JSON.parse(await readFile(reportFile, 'utf8'));
} catch {
  fail('Unable to read the deployment verification report.');
}

if (!Array.isArray(report.checks)) fail('Deployment verification report must contain a checks array.');
if (!Array.isArray(report.skippedChecks)) fail('Deployment verification report must contain a skippedChecks array.');

const payload = {
  schemaVersion: 1,
  repository: 'AndrewVerhoturov1/Real-wargame',
  ref,
  sourceSha,
  verificationStatus: report.status ?? 'unknown',
  checks: report.checks.map(({ name, command, status, durationMs }) => ({
    name,
    command,
    status,
    durationMs,
  })),
  skippedChecks: report.skippedChecks,
  generatedAt: new Date().toISOString(),
};

await mkdir(root, { recursive: true });
await writeFile(path.join(root, 'deployment-source.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote deployment-source.json for ${ref} @ ${sourceSha}.`);

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) fail(`Unknown argument: ${token}`);
    const key = token.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${key}.`);
    result[key] = value;
    index += 1;
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
