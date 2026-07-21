import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const skill = readFileSync('.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md', 'utf8');
const workflow = readFileSync('docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md', 'utf8');
const packageTemplate = readFileSync('.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-package.json', 'utf8');
const vercelTemplate = readFileSync('.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-vercel.json', 'utf8');
const buildTemplate = readFileSync('.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-deploy-build.mjs', 'utf8');

for (const token of [
  '## Exact-source bootstrap',
  'templates/exact-source-package.json',
  'templates/exact-source-deploy-build.mjs',
  'templates/exact-source-vercel.json',
  'code failure',
  'environment failure',
  'stale test contract',
  'Do not silently remove a failing check',
  'explicit user approval',
]) {
  assert.ok(skill.includes(token), `manual deployment skill must contain ${token}`);
}

for (const token of [
  '### Exact-source bootstrap for the connected Vercel project',
  'Classify every failure before changing code',
  'reduced matrix',
  'Do not silently remove a failing check',
]) {
  assert.ok(workflow.includes(token), `manual deployment workflow must contain ${token}`);
}

assert.ok(packageTemplate.includes('node deploy-build.mjs'));
assert.ok(vercelTemplate.includes('"outputDirectory": "dist"'));
for (const token of [
  '__EXACT_BRANCH__',
  '__EXACT_SOURCE_SHA__',
  "'git'",
  "'clone'",
  "['rev-parse', 'HEAD']",
  'Deployment source mismatch',
  "['ci', '--no-audit', '--no-fund']",
  "['tsc', '--noEmit']",
  "['vite', 'build']",
  "['run', 'deployment-pages:smoke']",
  'deployment-source.json',
]) {
  assert.ok(buildTemplate.includes(token), `exact-source deployment template must contain ${token}`);
}

console.log('Manual Vercel deployment skill contract passed.');
