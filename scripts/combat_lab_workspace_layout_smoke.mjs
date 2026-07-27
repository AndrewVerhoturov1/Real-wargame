import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const extension = readFileSync('src/combat-lab/CombatLabExtension.ts', 'utf8');
const shell = readFileSync('src/combat-lab/ui/CombatLabShell.ts', 'utf8');
const css = readFileSync('src/combat-lab/combat-lab.css', 'utf8');

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
  assert.ok(shell.includes(token), `Combat Lab shell must contain ${token}`);
}

for (const token of [
  '--combat-lab-dock-width: 440px',
  'body.app-shell-mode-combat-lab.workspace-simulation #app',
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
