import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeFiles = [
  'src/core/infantry-combat/runtime/AimRuntime.ts',
  'src/core/infantry-combat/runtime/FireTaskRuntime.ts',
  'src/core/infantry-combat/runtime/InfantryCombatSimulation.ts',
  'src/core/infantry-combat/runtime/ShotCommitService.ts',
  'src/core/infantry-combat/runtime/FriendlyFireRisk.ts',
];
const forbiddenCalls = [
  'Math.random(',
  'Date.now(',
  'performance.now(',
  'setTimeout(',
  'setInterval(',
  'window.',
  'document.',
  'PIXI.',
];

for (const file of runtimeFiles) {
  const source = await readFile(file, 'utf8');
  for (const fragment of forbiddenCalls) {
    assert.equal(source.includes(fragment), false, `${file} contains forbidden fragment ${fragment}`);
  }
}

const aimSource = await readFile('src/core/infantry-combat/runtime/AimRuntime.ts', 'utf8');
const trueStateLeakPatterns = [
  /state\.units/,
  /sourceUnitId/,
  /targetUnit/,
  /UnitModel\s*\[\s*['\"]position['\"]\s*\]/,
];
for (const pattern of trueStateLeakPatterns) {
  assert.equal(pattern.test(aimSource), false, `AimRuntime contains potential true-state leakage pattern ${pattern}`);
}

console.log(`Infantry combat Stage 5 forbidden-call scan passed: ${runtimeFiles.length} runtime files, no wall-clock/random/render calls and no true-target lookup in AimRuntime.`);
