import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [extension, hosts, tabs, editor, main, css, shellCss, layoutEnhancements, visualSession, sharedRuntime] = await Promise.all([
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
  readFile('src/combat-lab/main.ts', 'utf8'),
  readFile('src/combat-lab/combat-lab-workspace.css', 'utf8'),
  readFile('src/combat-lab/polygon-shell.css', 'utf8'),
  readFile('src/ui/TacticalWorkspaceLayoutEnhancements.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8'),
  readFile('src/core/testing/AiTestLabRuntime.ts', 'utf8'),
]);

const expectedProductHosts = [
  ['scene', 'Карта'],
  ['program', 'Программа'],
  ['laboratory', 'Лаборатория'],
  ['metrics', 'Метрики'],
  ['journal', 'Журнал'],
  ['batch', 'Серия'],
];
for (const [tabId, label] of expectedProductHosts) {
  assert.match(hosts, new RegExp(`tabId: '${tabId}'`));
  assert.match(hosts, new RegExp(`labelRu: '${label}'`));
}
assert.equal((hosts.match(/tabId:/g) ?? []).length, 8, 'Prototype shell keeps the existing eight product hosts as hidden compatibility mounts.');
assert.match(hosts, /tabId:\s*'parameters'[^\n]*labelRu:\s*'Параметры'/);
assert.match(hosts, /tabId:\s*'settings'[^\n]*labelRu:\s*'Общие редакторы'/);
assert.doesNotMatch(hosts, /labelRu:\s*'Стенд'/);
assert.match(tabs, /shell\.append\(topbar, historyStrip, viewport, hiddenHosts\)/,
  'The Polygon shell must compose the prototype top bar, honest history chrome, floating panels, and hidden compatibility hosts.');
assert.match(tabs, /polygon-shell-history-strip/);
assert.match(tabs, /polygon-shell-left-tabs/);
assert.match(tabs, /polygon-shell-right-tabs/);
assert.match(tabs, /polygon-shell-hidden-hosts/);
assert.doesNotMatch(tabs, /polygon-shell-primary-tabs|polygon-shell-timeline|polygon-shell-auxiliary-tabs/);
assert.doesNotMatch(tabs, /44\s*\/\s*54|событий\s*·\s*◆|Демонстрационная replay/i,
  'Stage 10 shell must not synthesize standalone prototype Journal data.');
assert.match(tabs, /setRightCollapsed\(/);
assert.match(
  tabs,
  /for\s*\(const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s+of\s+this\.panels\)\s*\2\.hidden\s*=\s*\1\s*!==\s*normalized/,
  'Tab activation must keep only the normalized compatibility host logically active.',
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
assert.match(main, /installLaboratoryPlaceholder/);
assert.match(css, /\.combat-lab-workspace-tab-list/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(shellCss, /\.polygon-shell-topbar/);
assert.match(shellCss, /\.polygon-shell-history-strip/);
assert.match(shellCss, /--polygon-history-h:\s*30px/);
assert.match(shellCss, /--polygon-chrome-h:\s*calc\(var\(--polygon-topbar-h\) \+ var\(--polygon-history-h\)\)/);
assert.match(shellCss, /\.polygon-shell-side-panel/);
assert.match(shellCss, /\.polygon-shell-hidden-hosts/);
assert.doesNotMatch(shellCss, /\.polygon-shell-primary-tabs|\.polygon-shell-timeline/);
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
