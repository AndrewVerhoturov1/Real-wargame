import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [controller, session, runState] = await Promise.all([
  readFile('src/combat-lab/runtime/CombatLabExperimentVisualController.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabExperimentRunState.ts', 'utf8'),
]);

for (const [source, name] of [[controller, 'controller'], [session, 'session'], [runState, 'run state']]) {
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, reportDiagnostics: true });
  assert.equal(result.diagnostics?.length ?? 0, 0, `${name} contains TypeScript syntax diagnostics`);
}

assert.match(controller, /export interface CombatLabExperimentVisualControllerOptions/);
assert.match(controller, /export class CombatLabExperimentVisualController/);
for (const method of ['reset', 'start', 'pause', 'stop', 'stepOnce', 'beforeSimulationStep', 'afterSimulationStep', 'getSnapshot', 'destroy']) {
  assert.match(controller, new RegExp(`\\b${method}\\(`), `Missing ${method}`);
}
assert.match(controller, /session\.resetExperimentScene\(experiment\.sceneSnapshot, this\.selectedSeed\)/);
assert.match(controller, /CombatLabScenarioExecutor\.create/);
assert.match(controller, /session\.setStepHooks\(controller, controller\)/);
assert.match(controller, /session\.clearStepHooks\(this\)/);
assert.match(controller, /cancelActionsOwnedBy\(ownerTokens\)/);
assert.match(session, /const stableState = this\.built\.state[\s\S]*restoreExportedScene\(stableState, sceneSnapshot\)[\s\S]*state: stableState/);
assert.match(session, /this\.experimentRuntimeActive = true/);
assert.match(session, /if \(!this\.experimentRuntimeActive\) preserveCombatLabTargetSurvivability/);
assert.match(runState, /Object\.freeze\(\{[\s\S]*journal:/);
assert.doesNotMatch(controller + session, /new\s+Ticker|addTickerListener|setInterval|requestAnimationFrame/);
assert.doesNotMatch(controller, /executeCombatLabCommand|tickSimulation/);

console.log('Combat Lab experiment visual controller smoke passed.');
