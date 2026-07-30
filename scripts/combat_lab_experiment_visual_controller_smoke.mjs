import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [controller, session, runState, effects, main, editor] = await Promise.all([
  readFile('src/combat-lab/runtime/CombatLabExperimentVisualController.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabExperimentRunState.ts', 'utf8'),
  readFile('src/rendering/PixiCombatEffectsRenderer.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
]);

for (const [source, name] of [
  [controller, 'controller'],
  [session, 'session'],
  [runState, 'run state'],
  [effects, 'combat effects renderer'],
  [main, 'Combat Lab main'],
  [editor, 'scenario editor'],
]) {
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
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
assert.doesNotMatch(controller + session, /new\s+Ticker|addTickerListener|setInterval/);
assert.doesNotMatch(controller, /executeCombatLabCommand|tickSimulation/);

// Performance regression: many fixed steps in one browser frame must collapse
// to one presentation publication, while terminal/user actions remain immediate.
assert.match(controller, /private pendingCoreSnapshot:/);
assert.match(controller, /private publicationFrame = 0/);
assert.match(controller, /private schedulePublication\(/);
assert.match(controller, /private publishImmediate\(/);
assert.match(controller, /flushPendingPublication\(\): void/);
assert.match(controller, /window\.requestAnimationFrame/);
assert.match(controller, /window\.cancelAnimationFrame/);
assert.match(controller, /this\.schedulePublication\(next\)/);
assert.match(controller, /this\.publishImmediate\(next\)/);

// Performance regression: routine Combat Lab renders retain the immutable map
// cache and let map revisions trigger a rebuild only when map data changes.
assert.match(main, /createCombatLabRenderContext/);
assert.match(main, /forceRender:\s*\(\)\s*=>\s*context\.board\.renderNow\(\)/);

// Performance regression: unchanged step presentation must not destroy and
// recreate the complete scenario editor DOM tree.
assert.match(editor, /private runtimePresentationKey = ''/);
assert.match(editor, /const nextKey = buildRuntimePresentationKey\(snapshot\)/);
assert.match(editor, /if \(nextKey === this\.runtimePresentationKey\) return/);
assert.match(editor, /function buildRuntimePresentationKey/);

// Performance regression: the effects renderer may inspect only a bounded
// recent tail when production event ledgers change and must do O(1) work when
// their array identities remain unchanged.
assert.match(effects, /MAX_RECENT_SOURCE_ENTRIES = 256/);
assert.match(effects, /MAX_PROCESSED_IDS = 512/);
assert.match(effects, /sourceChanged\(projectiles\.committedShots\.length/);
assert.match(effects, /sourceChanged\(projectiles\.impacts\.length/);
assert.match(effects, /sourceChanged\(history\.length/);
assert.match(effects, /function recentStart/);
assert.match(effects, /class BoundedIdWindow/);
assert.doesNotMatch(effects, /pruneProcessedHistory/);
assert.doesNotMatch(effects, /history\.map\(/);

console.log('Combat Lab experiment visual controller and performance regression smoke passed.');
