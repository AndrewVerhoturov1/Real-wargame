import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const skill = readFileSync('.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md', 'utf8');
const workflow = readFileSync('docs/workflow/MANUAL_VERCEL_DEPLOYMENT.md', 'utf8');
const packageTemplate = readFileSync('.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-package.json', 'utf8');
const vercelTemplate = readFileSync('.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-vercel.json', 'utf8');
const buildTemplate = readFileSync('.agents/skills/real-wargame-manual-vercel-deploy/templates/exact-source-deploy-build.mjs', 'utf8');

for (const token of [
  'Vercel is a publication stage, not a TDD or debugging environment',
  'manual GitHub Actions workflow',
  'exact local checkout',
  '## Emergency exact-source fallback',
  'permanent project `repo`',
  'one deployment for one verified SHA',
  'infrastructure failure',
  'new explicit deployment request',
  'Never silently reduce the gate',
  'passed with skipped checks',
  'Transfer to `real-wargame-preview` and deployment remain separate permissions',
  'Never enable deployment on every push',
]) {
  assert.ok(skill.includes(token), `manual deployment skill must contain ${token}`);
}

for (const token of [
  'exact checkout -> verification gate -> one build -> one prebuilt deployment -> published-page verification',
  'workflow_dispatch',
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
  'vercel deploy --prebuilt',
  'Vercel is publication, not a remote test runner',
  'Emergency fallback only',
  'Temporary diagnostic projects',
  'one deployment for one verified SHA',
  'Do not delete projects automatically',
]) {
  assert.ok(workflow.includes(token), `manual deployment workflow must contain ${token}`);
}

const packageJson = JSON.parse(packageTemplate);
assert.equal(packageJson.engines.node, '24.x');
assert.equal(packageJson.scripts.build, 'node deploy-build.mjs');
assert.ok(vercelTemplate.includes('"outputDirectory": "dist"'));
for (const token of [
  '__EXACT_BRANCH__',
  '__EXACT_SOURCE_SHA__',
  "['rev-parse', 'HEAD']",
  'Deployment source mismatch',
  "['ci', '--no-audit', '--no-fund']",
  "['run', 'verify:preview'",
  "['run', 'build:app']",
  'write_deployment_source.mjs',
  "['run', 'verify:deployment-pages'",
  'deployment-source.json',
]) {
  assert.ok(buildTemplate.includes(token), `exact-source fallback template must contain ${token}`);
}
assert.ok(!buildTemplate.includes("['tsc', '--noEmit']"), 'fallback must use the canonical gate rather than an extra historical matrix');
assert.ok(!skill.includes('separate Vercel project per branch'));

console.log('Manual Vercel deployment skill contract passed.');
