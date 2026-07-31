import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [extension, hosts, tabs, editor, main, css, layoutEnhancements, visualSession, sharedRuntime] = await Promise.all([
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/combat-lab/combat-lab-workspace.css', 'utf8'),
  readFile('src/ui/TacticalWorkspaceLayoutEnhancements.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
  readFile('src/core/testing/AiTestLabRuntime.ts', 'utf8'),
]);

const expectedTabs = [
  ['scene', 'Сцена'],
  ['program', 'Программа'],
  ['batch', 'Серия'],
  ['parameters', 'Параметры'],
  ['metrics', 'Метрики'],
  ['journal', 'Журнал'],
];
for (const [tabId, label] of expectedTabs) {
  assert.match(hosts, new RegExp(`tabId: '${tabId}'`));
  assert.match(hosts, new RegExp(`labelRu: '${label}'`));
}
assert.equal((hosts.match(/tabId:/g) ?? []).length, 6, 'Stage 10 workspace must contain exactly six tabs.');
assert.doesNotMatch(hosts, /labelRu:\s*'Стенд'/);
assert.match(tabs, /dock\.append\(header, toolbarHost, tabList, panelHost\)/,
  'The run toolbar must remain outside switchable tab panels.');
assert.match(
  tabs,
  /for\s*\(const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s+of\s+this\.panels\)\s*\2\.hidden\s*=\s*\1\s*!==\s*normalized/,
  'Tab activation must keep only the normalized panel visible regardless of local variable names.',
);
assert.match(tabs, /readonly hosts: CombatLabWorkspaceHosts/);

assert.match(extension, /onRequestBatch:\s*\(\)\s*=>\s*this\.activateTab\('batch'\)/);
assert.match(extension, /replayCombatLabRepresentativeRun\(this\.visualController, representative\)/);
assert.match(extension, /this\.activateTab\('program'\)/);
assert.doesNotMatch(extension, /replayCombatLabRepresentativeRun[\s\S]{0,250}\.start\(\)/,
  'Representative replay must not auto-start.');
assert.match(extension, /onRuntimeChanged:\s*this\.handleRuntimeChanged/);
assert.match(extension, /this\.runToolbar\?\.refresh\(snapshot\)/);
assert.match(extension, /workspace\.isActive\('metrics'\)[\s\S]*this\.runtimeStatus\?\.refresh\(snapshot\)/);
assert.match(extension, /workspace\.isActive\('program'\)[\s\S]*this\.editorPanel\?\.setRuntimeSnapshot\(snapshot\)/);
assert.match(extension, /getMode:\s*\(\)\s*=>\s*this\.effectiveMapMode\(\)/);
assert.doesNotMatch(extension, /activateTab\('stand'\)|activateMetricsView\('batch'\)|activateStandView|activateMetricsView/);
assert.doesNotMatch(extension, /Static Stage 10 compatibility markers|LegacyStage10HostContract/);
assert.doesNotMatch(extension, /installWorkspaceLabelLocalizer/);

assert.match(editor, /onSelectionChanged\?:/);
assert.match(editor, /ensureMutationAllowed\(\)/);
assert.match(main, /combat-lab:toggle-pause/);
assert.match(main, /combat-lab:set-paused/);
assert.match(css, /\.combat-lab-workspace-tab-list/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(layoutEnhancements, /runToolbar\?\.classList\.add\('combat-lab-run-toolbar'\)/,
  'Stage 10 toolbar host must publish the stable combat-lab-run-toolbar DOM contract.');
assert.match(layoutEnhancements, /advancedControls\?\.classList\.add\('combat-lab-advanced'\)/,
  'Stage 10 advanced controls must publish the stable combat-lab-advanced DOM contract.');
assert.match(layoutEnhancements, /metricsPanel\?\.classList\.add\('combat-lab-metrics-panel'\)/,
  'Stage 10 metrics panel must publish the stable combat-lab-metrics-panel DOM contract.');
assert.match(sharedRuntime, /AI_TEST_TIME_SCALES\s*=\s*\[0\.1,\s*0\.25,\s*0\.5,\s*1,\s*2,\s*4,\s*10\]/,
  'The shared header controls must publish the approved seven speeds.');
assert.match(visualSession, /COMBAT_LAB_VISUAL_SPEEDS\s*=\s*AI_TEST_TIME_SCALES/,
  'Combat Lab visual speeds must use the shared header control source.');

console.log('Combat Lab Stage 10 UI integration contract passed.');
