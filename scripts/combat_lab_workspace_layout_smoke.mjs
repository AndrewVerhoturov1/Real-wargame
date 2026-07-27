import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const extension = readFileSync('src/combat-lab/CombatLabExtension.ts', 'utf8');
const shell = readFileSync('src/combat-lab/ui/CombatLabShell.ts', 'utf8');
const uiBoundary = `${extension}\n${shell}`;
const css = [
  readFileSync('src/combat-lab/combat-lab.css', 'utf8'),
  readFileSync('src/combat-lab/combat-lab-workspace.css', 'utf8'),
].join('\n');

for (const token of [
  'combat-lab-dock',
  'data-combat-lab-tab',
  'adoptSimulationSidebar',
  'combat-lab-dock-collapsed',
]) {
  assert.ok(extension.includes(token), `Combat Lab extension must contain ${token}`);
}

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
  'width: auto !important',
  'height: auto !important',
  'body.app-shell-mode-combat-lab .simulation-unit-bar',
  'body.app-shell-mode-combat-lab .app-shell-menu',
  '.combat-lab-tab-list',
  '.combat-lab-tab-panel',
  'overflow-x: hidden',
]) {
  assert.ok(css.includes(token), `Combat Lab responsive layout CSS must contain ${token}`);
}

assert.ok(!css.includes('width: min(760px'), 'Combat Lab must not restore the oversized floating drawer');
assert.ok(!css.includes('.combat-lab-top {\n  display: flex'), 'Combat Lab toolbar must not restore the single-line horizontally scrolling control strip');

console.log('Combat Lab 1440x900 workspace layout contract passed.');
