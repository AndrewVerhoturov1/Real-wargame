import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const nodeVersion = readFileSync('.node-version', 'utf8').trim();

assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
assert.equal(packageJson.scripts['test:preview'], 'node scripts/test_preview_smokes.mjs');
assert.equal(packageJson.scripts['verify:preview'], 'node scripts/verify_preview.mjs');
assert.equal(packageJson.scripts['build:app'], 'vite build');
assert.equal(packageJson.scripts['verify:deployment-pages'], 'node scripts/deployment_pages_smoke.mjs');
assert.equal(packageJson.scripts.build, 'npm run build:app && npm run verify:deployment-pages');
assert.doesNotMatch(packageJson.scripts.build, /tsc|smoke|vercel/i);
assert.equal(vercel.buildCommand, 'npm run build:app');
assert.equal(vercel.outputDirectory, 'dist');
assert.equal(vercel.git?.deploymentEnabled, false);
assert.equal(nodeVersion, '24');

console.log('Preview deployment configuration contract passed.');
