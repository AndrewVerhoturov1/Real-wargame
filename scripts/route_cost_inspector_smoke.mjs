import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
const workspaceBase = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');
const routeCostUi = readFileSync('src/ui/RouteCostOverlayUi.ts', 'utf8');
const workspaceCss = readFileSync('src/tactical-workspace-compact-route.css', 'utf8');
const routeCostCss = readFileSync('src/route-cost-overlay.css', 'utf8');

for (const token of [
  'ROUTE_COST_INSPECTOR_RENDERED_EVENT',
  'data-tab="routeCost">Маршрут',
  'data-role="route-cost-inspector-host"',
  'routeCostInspectorPanel.hidden = !routeCostTabActive',
  'sidebarBody.hidden = routeCostTabActive',
  'setRouteCostOverlayActive(state, true)',
  'setRouteCostOverlayActive(state, false)',
  "shell.querySelector<HTMLElement>('.unit-route-profile')",
  "shell.querySelector<HTMLDetailsElement>('.unit-route-details')",
  'routeCostInspectorHost.append(routeProfileLabel, routeDetails)',
  "routeControls?.classList.add('route-controls-migrated')",
]) {
  assert.ok(workspace.includes(token), `route inspector workspace contract must contain ${token}`);
}
assert.ok(
  workspace.includes("shell.querySelector<HTMLButtonElement>('[data-action=\"route-cost-quick-toggle\"]')?.remove();"),
  'workspace shell must remove the obsolete bottom route-cost toggle',
);
assert.ok(workspaceBase.includes('data-action="route-cost-quick-toggle"'), 'baseline keeps legacy markup until the compatibility shell removes it');

for (const token of [
  'ROUTE_COST_INSPECTOR_RENDERED_EVENT',
  '[data-role="route-cost-inspector-host"]',
  'setRouteCostOverlayMode(state, mode.value as RouteCostOverlayMode)',
  '[data-role="route-details-profile"]',
]) {
  assert.ok(routeCostUi.includes(token), `route-cost inspector UI contract must contain ${token}`);
}
for (const token of [
  'toggleRouteCostOverlay',
  'data-action = \'route-cost-overlay\'',
  'data-action="route-cost-quick-toggle"',
  '.workspace-display-panel',
]) {
  assert.ok(!routeCostUi.includes(token), `route-cost inspector must not contain redundant layer control: ${token}`);
}

for (const token of [
  '.route-cost-inspector-panel .unit-route-profile',
  '.route-cost-inspector-panel .unit-route-details-panel',
  '.route-cost-inspector-panel .unit-route-details > summary',
  '.unit-bar-route-controls.route-controls-migrated',
  '.route-cost-inspector-panel > *',
  'grid-template-columns: minmax(0, 1fr)',
  'grid-area: auto',
  'white-space: normal',
  'overflow-wrap: anywhere',
  '[data-role="route-details-cost"]',
  '[data-role="route-details-reason"]',
  'color-scheme: dark',
  '.route-cost-inspector-panel select option',
  'background: #11170e',
]) {
  assert.ok(workspaceCss.includes(token), `route inspector CSS contract must contain ${token}`);
}

for (const token of [
  '.route-cost-inspector-panel .route-cost-controls',
  'margin-top: 0',
  'padding-top: 0',
  'border-top: 0',
]) {
  assert.ok(routeCostCss.includes(token), `route cost CSS must normalize inspector controls: ${token}`);
}

console.log('Route inspector smoke passed.');
