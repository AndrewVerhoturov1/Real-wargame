import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const extension = readFileSync('src/combat-lab/CombatLabExtension.ts', 'utf8');
const shell = readFileSync('src/combat-lab/ui/CombatLabShell.ts', 'utf8');
const renderer = readFileSync('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8');
const layoutEnhancements = readFileSync('src/ui/TacticalWorkspaceLayoutEnhancements.ts', 'utf8');
const unitBarPresentation = readFileSync('src/ui/UnitBarPresentation.ts', 'utf8');
const uiBoundary = `${extension}\n${shell}\n${renderer}\n${layoutEnhancements}\n${unitBarPresentation}`;
const labCss = readFileSync('src/combat-lab/combat-lab.css', 'utf8');
const workspaceCss = readFileSync('src/combat-lab/combat-lab-workspace.css', 'utf8');
const labPolishCss = readFileSync('src/combat-lab/combat-lab-ui-polish.css', 'utf8');
const refinedCss = readFileSync('src/tactical-workspace-refined.css', 'utf8');
const productionCss = readFileSync('src/tactical-workspace-production.css', 'utf8');
const css = `${labCss}\n${workspaceCss}\n${labPolishCss}\n${refinedCss}\n${productionCss}`;

for (const token of [
  'combat-lab-dock',
  'data-combat-lab-tab',
  'installSharedSimulationControls',
  'combat-lab-dock-collapsed',
]) {
  assert.ok(extension.includes(token), `Combat Lab extension must contain ${token}`);
}

assert.doesNotMatch(extension, /adoptSimulationSidebar/, 'Combat Lab must not reparent the production right inspector.');
assert.doesNotMatch(extension, /['"]fighter['"]/, 'Combat Lab must not duplicate the fighter tab inside the laboratory dock.');

for (const token of [
  'combat-lab-run-toolbar',
  'combat-lab-advanced',
  'combat-lab-metrics-panel',
  'combat-lab-log-panel',
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
  'getWeaponRuntime(unit)',
  'getWeaponDefinition(runtime.weaponId)',
  'weaponVisualKind(definition)',
  'data-weapon-kind',
  'weaponSilhouette(kind)',
  'Технический идентификатор:',
]) {
  assert.ok(unitBarPresentation.includes(token), `Shared soldier panel must contain ${token}`);
}

assert.ok(!css.includes('right: calc(var(--combat-lab-dock-width)'), 'Laboratory dock width must not replace the production right-inspector offset.');
assert.ok(!css.includes('width: min(760px'), 'Combat Lab must not restore the oversized floating drawer');
assert.ok(!css.includes('.combat-lab-top {\n  display: flex'), 'Combat Lab toolbar must not restore the single-line horizontally scrolling control strip');
assert.doesNotMatch(css, /\.workspace-time-controls\s+\.unit-bar-speed-group\s*\{[^}]*display:\s*none/s, 'Shared speed controls must remain visible in the header.');
assert.match(productionCss, /\.tactical-workspace-bar\s*\{[^}]*grid-template-columns:[^}]*minmax\(0, 1fr\)/s, 'Header must allocate a shrinkable action lane.');
assert.match(productionCss, /\.workspace-mode-switch,\s*\n\.workspace-time-controls,\s*\n\.workspace-top-actions\s*\{\s*min-width:\s*0/s, 'Header groups must be allowed to shrink without overlap.');
assert.match(labPolishCss, /#combat-lab-extension-root select,[\s\S]*min-height:\s*28px/, 'Combat Lab field controls must be compact.');

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
