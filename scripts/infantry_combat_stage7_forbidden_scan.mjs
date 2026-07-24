import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE_SHA = 'a4398ecc031d96f93c06ecd3a84456776c493cbc';
const candidateFiles = [
  'src/core/actions/PostureTransition.ts',
  'src/core/combat/CombatDamage.ts',
  'src/core/infantry-combat/runtime/AimRuntime.ts',
  'src/core/infantry-combat/runtime/BloodLossRuntime.ts',
  'src/core/infantry-combat/runtime/EffectiveCombatCapabilities.ts',
  'src/core/infantry-combat/runtime/FatigueRuntime.ts',
  'src/core/infantry-combat/runtime/FireTaskRuntime.ts',
  'src/core/infantry-combat/runtime/FirstAidRuntime.ts',
  'src/core/infantry-combat/runtime/InfantryBodyTypes.ts',
  'src/core/infantry-combat/runtime/InfantryCombatDiagnostics.ts',
  'src/core/infantry-combat/runtime/InfantryCombatReconciliation.ts',
  'src/core/infantry-combat/runtime/InfantryCombatRuntimeTypes.ts',
];
const additions = candidateFiles.map((file) => addedLines(file)).join('\n');
assert.equal(
  /\b(?:automatic[_ -]?fire|burst[_ -]?fire)\b/i.test(additions),
  false,
  'Stage 7 added forbidden automatic fire in first file group.',
);
console.log('STAGE7_DIAGNOSTIC_AUTOMATIC_FIRST_FILE_GROUP_PASSED');

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
