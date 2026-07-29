import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  html,
  vite,
  packageJson,
  deploymentPages,
  gameMain,
  gameApplication,
  editorMain,
  labMain,
  extension,
  contracts,
  runner,
  registry,
  factories,
  commands,
  metrics,
  digest,
] = await Promise.all([
  readFile('combat-lab.html', 'utf8'),
  readFile('vite.config.ts', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('scripts/deployment_pages_smoke.mjs', 'utf8'),
  readFile('src/main.ts', 'utf8'),
  readFile('src/game/GameApplication.ts', 'utf8'),
  readFile('src/ai-node-editor/main.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabContracts.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabRunner.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabScenarioRegistry.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabScenarioFactories.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabCommands.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabMetrics.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabDigest.ts', 'utf8'),
]);

for (const id of [
  'app',
  'hud',
  'language-toggle',
  'grid-toggle',
  'vision-toggle',
  'height-toggle',
  'pause-toggle',
  'ai-editor-open',
  'debug-panel',
  'combat-lab-extension-root',
]) assert.match(html, new RegExp(`id=["']${id}["']`), `Missing Combat Lab game element #${id}`);
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

assert.match(gameMain, /GameApplication\.create\(/);
assert.match(labMain, /GameApplication\.create\(/);
assert.match(extension, /CombatLabShell/);
assert.match(extension, /combat-lab-drawer/);
assert.doesNotMatch(gameMain, /CombatLabExtension|CombatLabVisualSession/, 'The game entry must not import Combat Lab runtime.');
assert.doesNotMatch(gameApplication, /CombatLabExtension|CombatLabVisualSession/, 'Shared game application must remain independent from laboratory runtime.');
assert.doesNotMatch(editorMain, /combat-lab/i, 'The AI editor entry must not import the Combat Lab shell.');

for (const marker of [
  'installGameEditorWorkbench',
  'installTacticalWorkspace',
  'installCombatControls',
  'installRouteCostOverlayUi',
  'installSceneExportControls',
]) assert.match(gameApplication, new RegExp(marker));

assert.match(contracts, /schemaVersion:\s*1/);
assert.match(contracts, /mode:\s*'headless'\s*\|\s*'visual'/);
assert.match(contracts, /scenarioRevision/);
assert.match(contracts, /defaultSeed/);
assert.match(runner, /tickSimulation\(/);

const cleanCore = [contracts, runner, registry, factories, commands, metrics, digest].join('\n');
assert.doesNotMatch(
  cleanCore,
  /\b(document|window|HTMLElement|HTMLCanvasElement|PIXI|pixi\.js|setInterval|requestAnimationFrame)\b/,
  'Headless Combat Lab core must remain independent from browser and PixiJS APIs.',
);
assert.doesNotMatch(cleanCore, /Math\.random\s*\(/, 'All Combat Lab randomness must use the explicit seed.');
assert.doesNotMatch(
  cleanCore,
  /spawnReferenceProjectile|spawnProjectile|createProjectileCandidate|activeProjectiles\.(push|splice)/,
  'Combat Lab must not create or edit projectiles directly.',
);
assert.doesNotMatch(
  cleanCore,
  /secondaryWeapon|groundEquipment|pickupEquipment|replacePrimaryWeapon|perceptionSignal|actionPort/i,
  'Stage 10+ code must not be introduced by Stage 9V.',
);

console.log('Combat Lab full-game application contract smoke passed.');
