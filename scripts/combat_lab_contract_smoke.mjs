import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = await Promise.all([
  readFile('combat-lab.html', 'utf8'),
  readFile('vite.config.ts', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('scripts/deployment_pages_smoke.mjs', 'utf8'),
  readFile('src/main.ts', 'utf8'),
  readFile('src/ai-node-editor/main.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabContracts.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabRunner.ts', 'utf8'),
]);
const [html, vite, packageJson, deploymentPages, gameMain, editorMain, contracts, runner] = files;

assert.match(html, /id="combat-lab-root"/);
assert.match(html, /Испытательный полигон/);
assert.match(html, /src="\/src\/combat-lab\/main\.ts"/);
assert.match(vite, /combatLab:\s*fileURLToPath\(new URL\('\.\/combat-lab\.html'/);
assert.match(deploymentPages, /combat-lab\.html/);

const scripts = JSON.parse(packageJson).scripts;
for (const name of [
  'combat-lab:smoke',
  'combat-lab-scenarios:smoke',
  'combat-lab-runner:smoke',
  'combat-lab-ui-contract:smoke',
]) assert.equal(typeof scripts[name], 'string', `Missing npm script ${name}`);

assert.doesNotMatch(gameMain, /combat-lab/i, 'The game entry must not import the Combat Lab shell.');
assert.doesNotMatch(editorMain, /combat-lab/i, 'The AI editor entry must not import the Combat Lab shell.');
assert.match(contracts, /schemaVersion:\s*1/);
assert.match(contracts, /mode:\s*'headless'\s*\|\s*'visual'/);
assert.match(contracts, /scenarioRevision/);
assert.match(contracts, /defaultSeed/);
assert.doesNotMatch(contracts, /\b(document|window|HTMLElement|PIXI|pixi\.js)\b/);
assert.doesNotMatch(runner, /\b(document|window|HTMLElement|PIXI|pixi\.js|setInterval|requestAnimationFrame)\b/);
assert.match(runner, /tickSimulation\(/);

console.log('Combat Lab application contract smoke passed.');
