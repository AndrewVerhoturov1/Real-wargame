import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const extension = readFileSync('src/combat-lab/CombatLabExtension.ts', 'utf8');
const shell = readFileSync('src/combat-lab/ui/CombatLabShell.ts', 'utf8');
const uiBoundary = `${extension}\n${shell}`;
const labCss = readFileSync('src/combat-lab/combat-lab.css', 'utf8');
const workspaceCss = readFileSync('src/combat-lab/combat-lab-workspace.css', 'utf8');
const css = `${labCss}\n${workspaceCss}`;

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
]) {
  assert.ok(uiBoundary.includes(token), `Combat Lab UI boundary must contain ${token}`);
}

for (const token of [
  '--combat-lab-dock-width: 440px',
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
]) {
  assert.ok(css.includes(token), `Combat Lab responsive layout CSS must contain ${token}`);
}

assert.ok(!css.includes('right: calc(var(--combat-lab-dock-width)'), 'Laboratory dock width must not replace the production right-inspector offset.');
assert.ok(!css.includes('width: min(760px'), 'Combat Lab must not restore the oversized floating drawer');
assert.ok(!css.includes('.combat-lab-top {\n  display: flex'), 'Combat Lab toolbar must not restore the single-line horizontally scrolling control strip');
assert.doesNotMatch(css, /\.unit-bar-speed-group\s*\{[^}]*display:\s*none/s, 'Shared speed controls must remain visible in Combat Lab.');

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
