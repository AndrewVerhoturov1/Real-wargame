import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/manual-vercel-preview.yml', 'utf8');

for (const token of [
  'workflow_dispatch:',
  'ref:',
  'expected_sha:',
  'allow_main:',
  'allow_skipped_checks:',
  'skip_reason:',
  'node-version: 24',
  'cache: npm',
  'npm ci',
  'git rev-parse HEAD',
  'refs/remotes/origin/main',
  'npm run verify:preview',
  'vercel@56.4.1 pull',
  'verify_vercel_project_link.mjs',
  'vercel@56.4.1 build',
  'write_deployment_source.mjs',
  'verify:deployment-pages',
  'vercel@56.4.1 deploy --prebuilt',
  'vercel@56.4.1 inspect',
  'vercel@56.4.1 curl /',
  'GITHUB_STEP_SUMMARY',
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
  'EXPECTED_VERCEL_PROJECT_NAME: repo',
]) {
  assert.ok(workflow.includes(token), `workflow must contain ${token}`);
}

for (const forbidden of [
  '\n  push:',
  '\n  pull_request:',
  'vercel project add',
  'vercel projects add',
  'vercel link',
  'vercel deploy --prod',
  'npm install',
  '@latest',
]) {
  assert.ok(!workflow.includes(forbidden), `workflow must not contain ${forbidden}`);
}

const gateIndex = workflow.indexOf('- name: Run deployment verification gate');
const firstSecretIndex = workflow.indexOf('secrets.VERCEL_TOKEN');
assert.ok(firstSecretIndex > gateIndex, 'Vercel secrets must not be exposed before the verification gate');

const shaGuard = workflow.indexOf('git rev-parse HEAD');
const install = workflow.indexOf('npm ci');
const gate = workflow.indexOf('npm run verify:preview');
const pull = workflow.indexOf('vercel@56.4.1 pull');
const build = workflow.indexOf('vercel@56.4.1 build');
const deploy = workflow.indexOf('vercel@56.4.1 deploy --prebuilt');
assert.ok(shaGuard >= 0 && shaGuard < install, 'SHA guard must run before npm ci');
assert.ok(gate > install && gate < pull, 'verification gate must run before Vercel authentication/build');
assert.ok(pull < build && build < deploy, 'Vercel pull/build/deploy order must be preserved');
assert.equal((workflow.match(/vercel@56\.4\.1 deploy --prebuilt/g) ?? []).length, 1, 'workflow must have exactly one prebuilt deploy command');

console.log('Manual Vercel Preview workflow contract passed.');
