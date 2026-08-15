import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const extension = readFileSync('src/combat-lab/CombatLabExtension.ts', 'utf8');
const workspaceTabs = readFileSync('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8');
const workspaceHosts = readFileSync('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8');
const shell = readFileSync('src/combat-lab/ui/CombatLabShell.ts', 'utf8');
const renderer = readFileSync('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8');
const visualSession = readFileSync('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8');
const aiTestRuntime = readFileSync('src/core/testing/AiTestLabRuntime.ts', 'utf8');
const layoutEnhancements = readFileSync('src/ui/TacticalWorkspaceLayoutEnhancements.ts', 'utf8');
const unitBarPresentation = readFileSync('src/ui/UnitBarPresentation.ts', 'utf8');
const labMain = readFileSync('src/combat-lab/main.ts', 'utf8');
const shellCss = readFileSync('src/combat-lab/polygon-shell.css', 'utf8');
const compatCss = readFileSync('src/combat-lab/polygon-shell-compat.css', 'utf8');
const workspaceBase = readFileSync('src/ui/TacticalWorkspaceBaseLegacy.ts', 'utf8');
const metricLabels = readFileSync('src/combat-lab/ui/CombatLabMetricLabels.ts', 'utf8');
const uiBoundary = `${extension}\n${workspaceTabs}\n${workspaceHosts}\n${shell}\n${renderer}\n${layoutEnhancements}\n${unitBarPresentation}`;

for (const token of [
  'CombatLabWorkspaceTabs.create',
  'installSharedSimulationControls',
  'combat-lab-dock-collapsed',
]) {
  assert.ok(extension.includes(token), `Combat Lab extension must contain ${token}`);
}

for (const token of [
  'polygon-shell',
  'polygon-shell-header',
  'polygon-shell-primary-tabs',
  'polygon-shell-left',
  'polygon-shell-center',
  'polygon-shell-right',
  'polygon-shell-timeline',
  'dataset.combatLabTab',
  'dataset.combatLabTabPanel',
  'tablist',
  'tabpanel',
]) {
  assert.ok(workspaceTabs.includes(token), `Polygon workspace shell must contain ${token}`);
}

for (const tabId of ['scene', 'program', 'laboratory', 'metrics', 'journal', 'batch', 'parameters', 'settings']) {
  assert.ok(workspaceHosts.includes(`tabId: '${tabId}'`), `Combat Lab must declare workspace tab ${tabId}`);
}
assert.equal((workspaceHosts.match(/tabId:/g) ?? []).length, 8, 'Polygon shell must expose six primary tabs plus two preserved product utility tabs.');

assert.doesNotMatch(extension, /adoptSimulationSidebar/, 'Combat Lab must not reparent the production right inspector.');
assert.doesNotMatch(extension, /['"]fighter['"]/, 'Combat Lab must not duplicate a selected-unit state inside the shell.');
assert.doesNotMatch(workspaceTabs, /new\s+CombatLabVisualSession|new\s+(?:PIXI\.)?Application\s*\(/,
  'Polygon shell must not create another runtime or Pixi application.');

for (const token of [
  'combat-lab-run-toolbar',
  'combat-lab-advanced',
  'combat-lab-metrics-panel',
  'combat-lab-authoring-log',
  'combat-lab-runtime-journal',
  'installStableViewportResize',
  'worldScaleX',
  'worldScaleY',
]) {
  assert.ok(uiBoundary.includes(token), `Combat Lab UI boundary must retain ${token}`);
}

for (const token of [
  '--polygon-shell-left-width: 360px',
  '--polygon-shell-right-width: 320px',
  'grid-template-columns: var(--polygon-shell-left-width) minmax(0, 1fr) var(--polygon-shell-right-width)',
  '.polygon-shell-primary-tabs',
  'grid-template-columns: repeat(6, minmax(0, 1fr))',
  '.polygon-shell-right-tabs',
  'grid-template-columns: repeat(4, minmax(0, 1fr))',
  '.polygon-shell-timeline',
  'combat-lab-dock-collapsed',
  'polygon-shell-right-collapsed',
  '@media (max-width: 980px)',
  '@media (max-height: 720px)',
]) {
  assert.ok(shellCss.includes(token), `Polygon responsive layout CSS must contain ${token}`);
}
assert.match(shellCss, /\.simulation-sidebar,[\s\S]*\.simulation-unit-bar,[\s\S]*display:\s*none\s*!important/,
  'The legacy production sidebars must not compete visually with the Polygon shell.');
assert.match(compatCss, /polygon-shell-primary-tabs[\s\S]*display:\s*grid\s*!important/,
  'Collapsing the left panel must not hide the primary Polygon navigation.');
assert.match(compatCss, /writing-mode:\s*horizontal-tb\s*!important/,
  'Legacy dock collapse styles must not rotate the new shell controls.');

for (const token of [
  'buildUnitBarSnapshot(unit)',
  'unit.infantryCombatRuntime',
  'primary?.roundsInWeapon',
  'infantry.ammoInventory.reserves',
  'infantry.physiology.blood.bloodLoss',
  'infantry.suppression.suppressionLevel',
  'weaponVisualKindFromText',
  'data-weapon-kind',
  'weaponSilhouette(snapshot.weaponVisualKind)',
  'Технический идентификатор:',
]) {
  assert.ok(unitBarPresentation.includes(token), `Shared soldier panel must retain ${token}`);
}

assert.match(visualSession, /COMBAT_LAB_VISUAL_SPEEDS\s*=\s*AI_TEST_TIME_SCALES/, 'Combat Lab must use the canonical shared speed list.');
assert.match(aiTestRuntime, /AI_TEST_TIME_SCALES\s*=\s*\[0\.1, 0\.25, 0\.5, 1, 2, 4, 10\]/, 'The shared header and Combat Lab must retain the ×0.1 speed.');
assert.match(labMain, /combat-lab-header-final\.css[\s\S]*polygon-shell\.css[\s\S]*polygon-shell-compat\.css/,
  'The Polygon shell and its compatibility overrides must load after legacy Combat Lab layout styles.');
assert.match(workspaceBase, /WORKSPACE_LAYOUT_TRANSITION_MILLISECONDS\s*=\s*150/, 'Workspace must retain the 150 ms layout transition.');
assert.match(workspaceBase, /scheduleWorkspaceViewportResize\(\)/, 'Workspace mode changes must schedule stable viewport resize.');
assert.match(metricLabels, /shotsCommitted:\s*'Выстрелы'/, 'Combat Lab metrics need explicit Russian labels.');
assert.ok(extension.includes('combatLabMetricLabelRu(key)'), 'Metric cards must render Russian metric labels.');

console.log('Combat Lab Polygon workspace layout contract passed.');
