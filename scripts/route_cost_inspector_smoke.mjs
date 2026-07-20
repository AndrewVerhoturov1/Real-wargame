import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
const workspaceBase = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');
const routeCostUi = readFileSync('src/ui/RouteCostOverlayUi.ts', 'utf8');

for (const token of [
  'ROUTE_COST_INSPECTOR_RENDERED_EVENT',
  'data-tab="routeCost"',
  'Стоимость маршрута',
  'data-role="route-cost-inspector-host"',
  'routeCostInspectorPanel.hidden = !routeCostTabActive',
  'sidebarBody.hidden = routeCostTabActive',
  "setSimulationLayerMode(state, 'info')",
]) {
  assert.ok(workspace.includes(token), `route-cost inspector workspace contract must contain ${token}`);
}
assert.ok(
  workspace.includes("shell.querySelector<HTMLButtonElement>('[data-action=\"route-cost-quick-toggle\"]')?.remove();"),
  'workspace shell must remove the obsolete bottom route-cost toggle',
);
assert.ok(workspaceBase.includes('data-action="route-cost-quick-toggle"'), 'baseline still owns the legacy markup until the compatibility shell removes it');

for (const token of [
  'ROUTE_COST_INSPECTOR_RENDERED_EVENT',
  '[data-role="route-cost-inspector-host"]',
  'toggleRouteCostOverlay(state)',
  'setRouteCostOverlayMode(state, mode.value as RouteCostOverlayMode)',
  '[data-role="route-details-profile"]',
]) {
  assert.ok(routeCostUi.includes(token), `route-cost inspector UI contract must contain ${token}`);
}
assert.ok(!routeCostUi.includes('.workspace-display-panel'), 'top View menu must not own duplicate route-cost controls');
assert.ok(!routeCostUi.includes('[data-action="route-cost-quick-toggle"]'), 'route-cost UI must not bind a removed bottom toggle');

console.log('Route cost inspector smoke passed.');
