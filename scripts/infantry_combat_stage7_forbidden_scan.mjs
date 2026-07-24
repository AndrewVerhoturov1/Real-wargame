import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE_SHA = 'a4398ecc031d96f93c06ecd3a84456776c493cbc';
ensureBaseCommit();
const changedFiles = git(['diff', '--name-only', BASE_SHA, 'HEAD'])
  .split('\n')
  .map((value) => value.trim())
  .filter(Boolean);

const forbiddenPathPrefixes = [
  '.github/',
  'src/app/',
  'src/components/',
  'src/ui/',
  'src/graph/',
  'src/deployment/',
  'api/',
  'public/',
];
for (const file of changedFiles) {
  assert.equal(
    forbiddenPathPrefixes.some((prefix) => file.startsWith(prefix)),
    false,
    `Stage 7 changed forbidden path: ${file}`,
  );
}

const sourceFiles = changedFiles.filter((file) => file.startsWith('src/') && /\.(?:ts|tsx|js|mjs)$/.test(file));
const additions = sourceFiles.map((file) => addedLines(file)).join('\n');
for (const [label, pattern] of [
  ['automatic fire', /\b(?:automatic[_ -]?fire|burst[_ -]?fire)\b/i],
  ['suppression', /\bsuppression\b/i],
  ['Graph v2', /\bgraph\s*v?2\b/i],
  ['machine-gun implementation', /\bmachine_gun\b/i],
  ['wall-clock timer', /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/],
  ['non-deterministic clock', /\b(?:Date\.now|performance\.now)\s*\(/],
  ['randomness', /\bMath\.random\s*\(/],
  ['unfinished marker', /\b(?:TODO|TBD|FIXME)\b/],
  ['UI dependency', /from\s+['"][^'"]*(?:ui|components|react|vue|svelte)[^'"]*['"]/i],
]) {
  assert.equal(pattern.test(additions), false, `Stage 7 added forbidden ${label}.`);
}

const firstAid = read('src/core/infantry-combat/runtime/FirstAidRuntime.ts');
assert.equal(/\.severity\s*=/.test(firstAid), false, 'First aid must not mutate structural severity.');
assert.equal(/bloodLoss\s*=/.test(firstAid), false, 'First aid must not restore or rewrite blood loss.');

const segment = read('src/core/infantry-combat/runtime/InfantryCombatSimulationSegment.ts');
assert.equal(count(segment, /tickReferenceProjectiles\s*\(/g), 1, 'The combat segment must advance projectiles through exactly one call site.');
for (const file of sourceFiles.filter((file) => file !== 'src/core/infantry-combat/runtime/InfantryCombatSimulationSegment.ts')) {
  const content = read(file);
  assert.equal(
    /tickReferenceProjectiles\s*\(|tickProjectileRuntime\s*\(/.test(content),
    false,
    `Projectile stepping leaked outside the single combat segment: ${file}`,
  );
}

const productionTick = read('src/core/simulation/SimulationTickLegacy.ts');
assert.equal(
  count(productionTick, /tickInfantryCombatSimulation\s*\(/g),
  1,
  'Production simulation must call the shared infantry combat timeline exactly once.',
);

assert.equal(
  changedFiles.includes('docs/subprojects/infantry-combat-prototype-v1/SHOOTING_STAGE_7_BLOOD_FATIGUE_FIRST_AID.md'),
  true,
  'Stage 7 design document is required.',
);

console.log(`Infantry combat Stage 7 forbidden scan passed: ${changedFiles.length} changed files, no scope leak, non-deterministic timer or duplicate projectile owner.`);

function ensureBaseCommit() {
  try {
    git(['cat-file', '-e', `${BASE_SHA}^{commit}`]);
  } catch {
    execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', BASE_SHA], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}
function addedLines(file) {
  return git(['diff', '--unified=0', BASE_SHA, 'HEAD', '--', file])
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}
function read(file) {
  return readFileSync(file, 'utf8');
}
function count(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}
