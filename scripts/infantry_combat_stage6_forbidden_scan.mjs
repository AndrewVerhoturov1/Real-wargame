import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeFiles = [
  'src/core/combat/UnitHitShapes.ts',
  'src/core/infantry-combat/runtime/InfantryBodyTypes.ts',
  'src/core/infantry-combat/runtime/InfantryBodyGeometry.ts',
  'src/core/infantry-combat/runtime/BodyPenetration.ts',
  'src/core/infantry-combat/runtime/WoundSeverity.ts',
  'src/core/infantry-combat/runtime/WoundRuntime.ts',
  'src/core/infantry-combat/runtime/WoundCapabilities.ts',
  'src/core/infantry-combat/runtime/WoundImpactApplication.ts',
  'src/core/infantry-combat/runtime/ProjectileRuntimeTypes.ts',
  'src/core/infantry-combat/runtime/ProjectileRuntime.ts',
  'src/core/infantry-combat/runtime/ProjectileStepper.ts',
];
const forbiddenFragments = [
  'Math.random(',
  'Date.now(',
  'performance.now(',
  'new Date(',
  'randomUUID',
  'setTimeout(',
  'setInterval(',
  'window.',
  'document.',
  'PIXI.',
  'applyUnitHit(',
  'state.units.find(',
];

for (const file of runtimeFiles) {
  const source = await readFile(file, 'utf8');
  for (const fragment of forbiddenFragments) {
    assert.equal(source.includes(fragment), false, `${file} contains forbidden fragment ${fragment}`);
  }
}

for (const file of [
  'src/core/infantry-combat/runtime/WoundSeverity.ts',
  'src/core/infantry-combat/runtime/WoundRuntime.ts',
  'src/core/infantry-combat/runtime/WoundCapabilities.ts',
  'src/core/infantry-combat/runtime/WoundImpactApplication.ts',
]) {
  const source = await readFile(file, 'utf8');
  assert.equal(source.includes('WeakMap'), false, `${file} must not use WeakMap as wound source of truth`);
}

const stepper = await readFile('src/core/infantry-combat/runtime/ProjectileStepper.ts', 'utf8');
for (const required of [
  'queryUnitsNearBallisticSegmentInto',
  'traceBallisticRayPrepared',
  'MAX_BODY_PENETRATIONS_PER_PROJECTILE',
]) {
  assert.equal(stepper.includes(required), true, `ProjectileStepper must retain bounded shared path: ${required}`);
}

console.log(`Infantry combat Stage 6 forbidden scan passed: ${runtimeFiles.length} production files, no wall-clock/random/render/legacy damage/full target scan and no wound WeakMap truth.`);
