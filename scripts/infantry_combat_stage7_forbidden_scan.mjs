import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE_SHA = 'a4398ecc031d96f93c06ecd3a84456776c493cbc';
const changedFiles = git(['diff', '--name-only', `${BASE_SHA}...HEAD`])
  .split('\n')
  .map((value) => value.trim())
  .filter(Boolean);
const forbiddenPathPrefixes = [
  '.github/', 'src/app/', 'src/components/', 'src/ui/', 'src/graph/',
  'src/deployment/', 'api/', 'public/',
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
console.log('STAGE7_DIAGNOSTIC_FORBIDDEN_PATHS_AND_PATTERNS_PASSED');

function addedLines(file) {
  return git(['diff', '--unified=0', `${BASE_SHA}...HEAD`, '--', file])
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}
