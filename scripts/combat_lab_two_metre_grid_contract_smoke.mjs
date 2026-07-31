import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [scaleSource, factories, registry, builtIns, executor, summary, extension] = await Promise.all([
  readFile('src/core/testing/combat-lab/CombatLabGridScale.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabScenarioFactories.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/CombatLabScenarioRegistry.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabBuiltInExperiments.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabScenarioExecutor.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabExperimentSettingsSummary.ts', 'utf8'),
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
]);

const js = ts.transpileModule(scaleSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const scale = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
assert.equal(scale.COMBAT_LAB_METRES_PER_CELL, 2);
assert.equal(scale.combatLabMetresToGrid(20), 10);
assert.equal(scale.combatLabGridToMetres(10), 20);
assert.equal(scale.combatLabMapCellsForMetres(230), 115);
assert.equal(scale.combatLabCellSizePixelsForPhysicalScale(5), 10);

assert.match(factories, /metersPerCell:\s*COMBAT_LAB_METRES_PER_CELL/);
assert.match(factories, /combatLabMetresToGrid\(fixture\.xMetres\)/);
assert.match(factories, /combatLabMetresToGrid\(fixture\.yMetres\s*\+\s*commonYOffsetMetres\)/);
assert.match(registry, /targetGrid:\s*\{\s*x:\s*40,\s*y:\s*27\.5\s*\}/);
assert.match(builtIns, /command\.targetGrid\.x\s*\*\s*scene\.map\.metersPerCell/);
assert.match(executor, /target\.xMetres\s*\/\s*metresPerCell/);
assert.match(summary, /Сетка:\s*2×2 м/);
assert.match(extension, /hideCombatLabVisualGrid/);

console.log('Combat Lab two-metre grid contract smoke passed.');
