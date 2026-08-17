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
  'polygon-shell-topbar',
  'polygon-shell-left',
  'polygon-shell-left-tabs',
  'polygon-shell-right',
  'polygon-shell-right-tabs',
  'polygon-shell-hidden-hosts',
  'dataset.combatLabTab',
  'dataset.combatLabTabPanel',
  'tablist',
  'tabpanel',
]) {
  assert.ok(workspaceTabs.includes(token), `Polygon workspace shell must contain ${token}`);
}
for (const removed of ['polygon-shell-header', 'polygon-shell-primary-tabs', 'polygon-shell-center', 'polygon-shell-timeline', 'polygon-shell-auxiliary-tabs']) {
  assert.ok(!workspaceTabs.includes(removed), `Obsolete reconstructed shell element must be removed: ${removed}`);
}

for (const tabId of ['scene', 'program', 'laboratory', 'metrics', 'journal', 'batch', 'parameters', 'settings']) {
  assert.ok(workspaceHosts.includes(`tabId: '${tabId}'`), `Combat Lab must retain product host ${tabId}`);
}
assert.equal((workspaceHosts.match(/tabId:/g) ?? []).length, 8, 'The compatibility layer retains eight existing product hosts.');

assert.doesNotMatch(extension, /adoptSimulationSidebar/, 'Combat Lab must not reparent the production right inspector.');
assert.doesNotMatch(extension, /['"]fighter['"]/, 'Combat Lab must not duplicate selected-unit state inside the shell.');
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
  '--polygon-topbar-h: 58px',
  '--polygon-left-w: 372px',
  '--polygon-right-w: 336px',
  '--polygon-panel-gap: 14px',
  '--polygon-top: #344321',
  '--polygon-top-2: #273318',
  '--polygon-accent: #d8b941',
  '--polygon-panel-solid: #f6f5ee',
  '.polygon-shell-topbar',
  'grid-template-columns: auto minmax(0, 1fr) auto',
  '.polygon-shell-side-panel',
  '.polygon-shell-left-tabs',
  '.polygon-shell-right-tabs',
  'flex-wrap: wrap',
  '.polygon-shell-hidden-hosts',
  'combat-lab-dock-collapsed',
  'polygon-shell-right-collapsed',
  '@media (max-width: 1120px)',
]) {
  assert.ok(shellCss.includes(token), `Prototype Polygon responsive CSS must contain ${token}`);
}
assert.doesNotMatch(shellCss, /\.polygon-shell-primary-tabs|\.polygon-shell-timeline/,
  'The previous global tabs and fake timeline must not return.');
assert.match(shellCss, /\.simulation-sidebar,[\s\S]*\.simulation-unit-bar,[\s\S]*display:\s*none\s*!important/,
  'Legacy production sidebars must not compete visually with the Polygon shell.');
assert.match(compatCss, /\.app-shell-menu-trigger[\s\S]*height:\s*34px/,
  'The shared menu trigger must visually integrate into the 58px prototype top bar.');

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
assert.match(aiTestRuntime, /AI_TEST_TIME_SCALES\s*=\s*\[0\.1, 0\.25, 0\.5, 1, 2, 5, 10\]/, 'The shared header and Combat Lab must retain the canonical speed list.');
assert.match(labMain, /combat-lab-header-final\.css[\s\S]*polygon-shell\.css[\s\S]*polygon-shell-compat\.css/,
  'Prototype shell compatibility overrides must load after legacy Combat Lab layout styles.');
assert.match(workspaceBase, /WORKSPACE_LAYOUT_TRANSITION_MILLISECONDS\s*=\s*150/, 'Workspace must retain the 150 ms layout transition.');
assert.match(workspaceBase, /scheduleWorkspaceViewportResize\(\)/, 'Workspace mode changes must schedule stable viewport resize.');
assert.match(metricLabels, /shotsCommitted:\s*'Выстрелы'/, 'Combat Lab metrics need explicit Russian labels.');
assert.ok(extension.includes('combatLabMetricLabelRu(key)'), 'Metric cards must render Russian metric labels.');

console.log('Combat Lab Polygon workspace layout contract passed.');