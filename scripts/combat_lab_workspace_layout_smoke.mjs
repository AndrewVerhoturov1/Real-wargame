import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const extension = readFileSync('src/combat-lab/CombatLabExtension.ts', 'utf8');
const workspaceTabs = readFileSync('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8');
const workspaceHosts = readFileSync('src/combat-lab/ui/CombatLabWorkspaceHosts.ts', 'utf8');
const shell = readFileSync('src/combat-lab/ui/CombatLabShell.ts', 'utf8');
const renderer = readFileSync('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8');
const visualSession = readFileSync('src/combat-lab/runtime/CombatLabVisualSession.ts', 'utf8');
const layoutEnhancements = readFileSync('src/ui/TacticalWorkspaceLayoutEnhancements.ts', 'utf8');
const unitBarPresentation = readFileSync('src/ui/UnitBarPresentation.ts', 'utf8');
const uiBoundary = `${extension}\n${workspaceTabs}\n${workspaceHosts}\n${shell}\n${renderer}\n${layoutEnhancements}\n${unitBarPresentation}`;
const labMain = readFileSync('src/combat-lab/main.ts', 'utf8');
const labCss = readFileSync('src/combat-lab/combat-lab.css', 'utf8');
const workspaceCss = readFileSync('src/combat-lab/combat-lab-workspace.css', 'utf8');
const labPolishCss = readFileSync('src/combat-lab/combat-lab-ui-polish.css', 'utf8');
const labHeaderCss = readFileSync('src/combat-lab/combat-lab-header-final.css', 'utf8');
const refinedCss = readFileSync('src/tactical-workspace-refined.css', 'utf8');
const productionCss = readFileSync('src/tactical-workspace-production.css', 'utf8');
const finalFixesCss = readFileSync('src/tactical-workspace-final-fixes.css', 'utf8');
const workspaceBase = readFileSync('src/ui/TacticalWorkspaceBaseLegacy.ts', 'utf8');
const metricLabels = readFileSync('src/combat-lab/ui/CombatLabMetricLabels.ts', 'utf8');
const css = `${labCss}\n${workspaceCss}\n${labPolishCss}\n${labHeaderCss}\n${refinedCss}\n${productionCss}\n${finalFixesCss}`;

for (const token of [
  'CombatLabWorkspaceTabs.create',
  'installSharedSimulationControls',
  'combat-lab-dock-collapsed',
]) {
  assert.ok(extension.includes(token), `Combat Lab extension must contain ${token}`);
}
for (const token of [
  'combat-lab-dock',
  'dataset.combatLabTab',
  'dataset.combatLabTabPanel',
  'role',
  'tablist',
  'tabpanel',
]) {
  assert.ok(workspaceTabs.includes(token), `Combat Lab workspace tabs must contain ${token}`);
}
for (const tabId of ['scene', 'program', 'batch', 'parameters', 'metrics', 'journal']) {
  assert.ok(workspaceHosts.includes(`tabId: '${tabId}'`), `Combat Lab must declare workspace tab ${tabId}`);
}
assert.equal((workspaceHosts.match(/tabId:/g) ?? []).length, 6, 'Combat Lab must expose exactly six workspace tabs.');

assert.doesNotMatch(extension, /adoptSimulationSidebar/, 'Combat Lab must not reparent the production right inspector.');
assert.doesNotMatch(extension, /['"]fighter['"]/, 'Combat Lab must not duplicate the fighter tab inside the laboratory dock.');

for (const token of [
  'combat-lab-run-toolbar',
  'combat-lab-advanced',
  'combat-lab-metrics-panel',
  'combat-lab-authoring-log',
  'combat-lab-runtime-journal',
  'workspace-resize-handle-left',
  'workspace-resize-handle-right',
  'workspace-time-controls',
  'installStableViewportResize',
  '__combatLabLayoutDiagnostics',
  'worldScaleX',
  'worldScaleY',
]) {
  assert.ok(uiBoundary.includes(token), `Combat Lab UI boundary must contain ${token}`);
}

for (const token of [
  '--combat-lab-dock-width: 370px',
  '--workspace-sidebar: 370px',
  'body.app-shell-mode-combat-lab.workspace-simulation #app',
  'body.app-shell-mode-combat-lab.workspace-editor #app',
  'left: calc(var(--combat-lab-dock-width)',
  'body.app-shell-mode-combat-lab .simulation-unit-bar',
  'body.app-shell-mode-combat-lab .app-shell-menu',
  '.combat-lab-tab-list',
  'grid-template-columns: repeat(3, minmax(0, 1fr))',
  '.combat-lab-tab-panel',
  'overflow-x: hidden',
  'body.app-shell-mode-combat-lab.workspace-simulation.sidebar-collapsed #app',
  'right: 58px !important',
  'grid-template-areas:',
  '"profile stats"',
  '"posture controls"',
  '.unit-bar-weapon',
  '.workspace-time-controls',
  'grid-template-columns: repeat(6, minmax(0, 1fr))',
]) {
  assert.ok(css.includes(token), `Combat Lab responsive layout CSS must contain ${token}`);
}

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
  assert.ok(unitBarPresentation.includes(token), `Shared soldier panel must contain ${token}`);
}

assert.match(visualSession, /COMBAT_LAB_VISUAL_SPEEDS\s*=\s*\[0\.25, 0\.5, 1, 2, 4, 10\]/, 'Combat Lab must accept every speed shown by the shared header.');
assert.match(labMain, /combat-lab-header-final\.css/, 'The readable dock header correction must load last.');
assert.match(labHeaderCss, /grid-template-areas:\s*\n\s*"brand toggle"\s*\n\s*"status toggle"/s, 'The dock title must own a full readable row.');
assert.match(finalFixesCss, /\.workspace-time-controls \.unit-bar-speed-group\s*\{[^}]*grid-column:\s*auto !important/s, 'Legacy lower-panel grid placement must not push speed buttons onto a second row.');
assert.match(finalFixesCss, /\.workspace-resize-handle-right\s*\{[^}]*left:\s*0/s, 'The right resize handle must stay inside the clickable inspector edge.');
assert.match(finalFixesCss, /\[data-action="clear-order"\]\s*\{[^}]*grid-column:\s*1 \/ -1/s, 'The cancel-order command must fill its grid lane.');

assert.ok(!css.includes('right: calc(var(--combat-lab-dock-width)'), 'Laboratory dock width must not replace the production right-inspector offset.');
assert.ok(!css.includes('width: min(760px'), 'Combat Lab must not restore the oversized floating drawer');
assert.ok(!css.includes('.combat-lab-top {\n  display: flex'), 'Combat Lab toolbar must not restore the single-line horizontally scrolling control strip');
assert.doesNotMatch(css, /\.workspace-time-controls\s+\.unit-bar-speed-group\s*\{[^}]*display:\s*none/s, 'Shared speed controls must remain visible in the header.');
assert.match(productionCss, /\.tactical-workspace-bar\s*\{[^}]*grid-template-columns:[^}]*minmax\(0, 1fr\)/s, 'Header must allocate a shrinkable action lane.');
assert.match(productionCss, /\.workspace-mode-switch,\s*\n\.workspace-time-controls,\s*\n\.workspace-top-actions\s*\{\s*min-width:\s*0/s, 'Header groups must be allowed to shrink without overlap.');
assert.match(labPolishCss, /#combat-lab-extension-root select,[\s\S]*min-height:\s*28px/, 'Combat Lab field controls must be compact.');

const toolbarRule = labCss.match(/\.combat-lab-run-toolbar\s*\{([^}]*)\}/s)?.[1] ?? '';
assert.doesNotMatch(toolbarRule, /position:\s*sticky/, 'Combat Lab run controls must scroll instead of covering lower fields.');
assert.match(workspaceBase, /WORKSPACE_LAYOUT_TRANSITION_MILLISECONDS\s*=\s*150/, 'Workspace must name the 150 ms layout transition.');
assert.match(workspaceBase, /scheduleWorkspaceViewportResize\(\)/, 'Workspace mode changes must schedule stable viewport resize.');
assert.match(metricLabels, /shotsCommitted:\s*'Выстрелы'/, 'Combat Lab metrics need explicit Russian labels.');
assert.ok(extension.includes('combatLabMetricLabelRu(key)'), 'Metric cards must render Russian metric labels.');

assert.doesNotMatch(
  workspaceCss,
  /\.simulation-unit-bar\s*\{[^}]*(?:grid-template-columns|grid-template-areas|min-height|max-height)/s,
  'Combat Lab must not replace the production lower soldier panel layout.',
);
assert.doesNotMatch(
  workspaceCss,
  /--workspace-bottom\s*:/,
  'Combat Lab must use the same lower-panel height rules as the ordinary game.',
);

console.log('Combat Lab 1440x900 dual-sidebar workspace layout contract passed.');
