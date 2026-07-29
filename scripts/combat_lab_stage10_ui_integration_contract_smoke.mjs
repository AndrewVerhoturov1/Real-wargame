import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [extension, editor, main, css, layoutEnhancements, visualSession] = await Promise.all([
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/combat-lab/combat-lab-workspace.css', 'utf8'),
  readFile('src/ui/TacticalWorkspaceLayoutEnhancements.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
]);

for (const label of ['Сцена', 'Программа', 'Текущий прогон', 'Серия прогонов']) assert.match(extension, new RegExp(label));
for (const host of [
  'toolbarHost', 'runtimeStatusHost', 'sceneHost', 'programHost',
  'currentMetricsHost', 'batchPanelHost', 'batchResultsHost', 'logHost',
]) assert.match(extension, new RegExp(`readonly ${host}: HTMLElement`));

assert.match(extension, /onRequestBatch:\s*\(\)\s*=>\s*\{\s*this\.activateTab\('metrics'\);\s*this\.activateMetricsView\('batch'\)/s);
assert.match(extension, /replayCombatLabRepresentativeRun\(this\.visualController, representative\)/);
assert.match(extension, /this\.activateTab\('stand'\)/);
assert.doesNotMatch(extension, /replayCombatLabRepresentativeRun[\s\S]{0,250}\.start\(\)/, 'Representative replay must not auto-start.');
assert.match(extension, /onRuntimeChanged:\s*this\.handleRuntimeChanged/);
assert.match(extension, /this\.runToolbar\?\.refresh\(snapshot\)/);
assert.match(extension, /this\.runtimeStatus\?\.refresh\(snapshot\)/);
assert.match(extension, /this\.editorPanel\?\.setRuntimeSnapshot\(snapshot\)/);
assert.match(extension, /getMode:\s*\(\)\s*=>\s*this\.effectiveMapMode\(\)/);
assert.match(editor, /onSelectionChanged\?:/);
assert.match(editor, /ensureMutationAllowed\(\)/);
assert.match(main, /combat-lab:toggle-pause/);
assert.match(main, /combat-lab:set-paused/);
assert.match(css, /\.combat-lab-subtab-list/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(layoutEnhancements, /runToolbar\?\.classList\.add\('combat-lab-run-toolbar'\)/,
  'Stage 10 toolbar host must publish the stable combat-lab-run-toolbar DOM contract.');
assert.match(layoutEnhancements, /advancedControls\?\.classList\.add\('combat-lab-advanced'\)/,
  'Stage 10 advanced controls must publish the stable combat-lab-advanced DOM contract.');
assert.match(layoutEnhancements, /metricsPanel\?\.classList\.add\('combat-lab-metrics-panel'\)/,
  'Stage 10 metrics panel must publish the stable combat-lab-metrics-panel DOM contract.');
assert.match(visualSession, /COMBAT_LAB_VISUAL_SPEEDS\s*=\s*\[0\.25, 0\.5, 1, 2, 4, 10\]/,
  'Combat Lab visual speeds must match the shared header controls exactly.');
assert.doesNotMatch(visualSession, /COMBAT_LAB_VISUAL_SPEEDS\s*=\s*\[[^\]]*0\.1/,
  'The removed 0.1 speed must not return outside the shared header contract.');

console.log('Combat Lab Stage 10 UI integration contract passed.');
