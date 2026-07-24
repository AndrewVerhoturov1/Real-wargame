import { readFile } from 'node:fs/promises';

const productionFiles = [
  'src/core/actions/PostureTransition.ts',
  'src/core/combat/UnitHitShapes.ts',
  'src/core/combat/BallisticTrace.ts',
  'src/core/combat/CombatUnitSpatialIndex.ts',
  'src/core/infantry-combat/runtime/AimRuntime.ts',
  'src/core/infantry-combat/runtime/BodyPenetration.ts',
  'src/core/infantry-combat/runtime/FireTaskRuntime.ts',
  'src/core/infantry-combat/runtime/InfantryBodyTypes.ts',
  'src/core/infantry-combat/runtime/InfantryCombatReconciliation.ts',
  'src/core/infantry-combat/runtime/InfantryCombatSimulation.ts',
  'src/core/infantry-combat/runtime/InfantryCombatUnitRuntime.ts',
  'src/core/infantry-combat/runtime/ProjectileRuntime.ts',
  'src/core/infantry-combat/runtime/ProjectileRuntimeTypes.ts',
  'src/core/infantry-combat/runtime/ProjectileStepper.ts',
  'src/core/infantry-combat/runtime/ShotCommitService.ts',
  'src/core/infantry-combat/runtime/WoundCapabilities.ts',
  'src/core/infantry-combat/runtime/WoundImpactApplication.ts',
  'src/core/infantry-combat/runtime/WoundRuntime.ts',
  'src/core/infantry-combat/runtime/WoundSeverity.ts',
];

const forbidden = [
  ['Math.random', /\bMath\.random\s*\(/],
  ['Date.now', /\bDate\.now\s*\(/],
  ['performance.now', /\bperformance\.now\s*\(/],
  ['new Date', /\bnew\s+Date\s*\(/],
  ['randomUUID', /\brandomUUID\s*\(/],
  ['setTimeout', /\bsetTimeout\s*\(/],
  ['setInterval', /\bsetInterval\s*\(/],
  ['window', /\bwindow\b/],
  ['document', /\bdocument\b/],
  ['PIXI', /\bPIXI\b/],
  ['old applyUnitHit', /\bapplyUnitHit\s*\(/],
  ['unit full scan during impact', /state\.units\.find\s*\(/],
];

const failures = [];
for (const file of productionFiles) {
  const source = await readFile(file, 'utf8');
  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) failures.push(`${file}: ${label}`);
  }
}
const woundSources = await Promise.all([
  'src/core/infantry-combat/runtime/InfantryBodyTypes.ts',
  'src/core/infantry-combat/runtime/WoundImpactApplication.ts',
  'src/core/infantry-combat/runtime/WoundRuntime.ts',
].map((file) => readFile(file, 'utf8')));
if (woundSources.some((source) => /new\s+WeakMap/.test(source))) failures.push('wound source of truth uses WeakMap');
if (failures.length > 0) throw new Error(`Stage 6 forbidden scan failed:\n${failures.join('\n')}`);
console.log(`Stage 6 forbidden scan PASS: ${productionFiles.length} production files.`);
