import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const runtime = await readFile('src/combat-lab/parameters/CombatLabLaboratoryRuntime.ts', 'utf8').catch(() => '');
const registry = await readFile('src/combat-lab/parameters/CombatLabQuickParameterRegistry.ts', 'utf8');

assert.ok(runtime.length > 0, 'Laboratory runtime owner is missing.');
const result = ts.transpileModule(runtime, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length ?? 0, 0, 'Laboratory runtime contains TypeScript syntax diagnostics.');

assert.match(runtime, /type CombatLabLaboratoryTargetV1/);
assert.match(runtime, /kind:\s*'participant'/);
assert.match(runtime, /kind:\s*'participants'/);
assert.match(runtime, /kind:\s*'area'/);
assert.match(runtime, /interface CombatLabLaboratoryAreaV1/);
assert.match(runtime, /readonly vertices:/);
assert.match(runtime, /interface CombatLabLaboratoryOverrideV1/);
assert.match(runtime, /CombatLabQuickParameterIdV1/);
assert.match(runtime, /getCombatLabQuickParameterDescriptor/);
assert.match(runtime, /resolveCombatLabLaboratoryValue/);
assert.match(runtime, /listApplicableCombatLabLaboratoryOverrides/);
assert.match(runtime, /pointInPolygon/);
assert.match(runtime, /appliedOverrideIds/);

// Laboratory must reuse the existing parameter registry rather than copying
// the six accuracy parameter IDs into another catalog.
for (const id of [
  'accuracy.dispersion_multiplier',
  'accuracy.aim_time_seconds',
  'accuracy.physical_aim_threshold',
  'accuracy.shooting_skill',
  'accuracy.weapon_proficiency',
  'accuracy.randomness_multiplier',
]) {
  assert.match(registry, new RegExp(id.replace('.', '\\.')));
  assert.doesNotMatch(runtime, new RegExp(`['\"]${id.replace('.', '\\.')}['\"]`));
}

assert.doesNotMatch(runtime, /window\.|localStorage|HistoryProvider|viewTime/);
console.log('Combat Lab Laboratory runtime contract smoke passed.');
