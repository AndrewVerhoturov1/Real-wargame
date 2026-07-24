import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE_SHA = 'a4398ecc031d96f93c06ecd3a84456776c493cbc';
const changedFiles = git(['diff', '--name-only', `${BASE_SHA}...HEAD`])
  .split('\n')
  .map((value) => value.trim())
  .filter(Boolean);
const sourceFiles = changedFiles.filter((file) => file.startsWith('src/') && /\.(?:ts|tsx|js|mjs)$/.test(file));
const additions = sourceFiles.map((file) => addedLines(file)).join('\n');
for (const [label, pattern] of [
  ['automatic fire', /\b(?:automatic[_ -]?fire|burst[_ -]?fire)\b/i],
  ['suppression', /\bsuppression\b/i],
]) {
  assert.equal(pattern.test(additions), false, `Stage 7 added forbidden ${label}.`);
}
console.log('STAGE7_DIAGNOSTIC_AUTOMATIC_AND_SUPPRESSION_PASSED');

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
