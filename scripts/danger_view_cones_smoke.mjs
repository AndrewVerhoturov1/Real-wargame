import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeUi = readFileSync('src/core/ui/RuntimeUiState.ts', 'utf8');
const workspace = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
const app = readFileSync('src/rendering/PixiApp.ts', 'utf8');
const overlayRenderer = readFileSync('src/rendering/PixiOverlayRenderer.ts', 'utf8');
const legacyViewConeRenderer = readFileSync('src/rendering/PixiViewConeRenderer.ts', 'utf8');

for (const token of [
  'showThreatCones: boolean',
  'export function toggleThreatCones',
  'layer.showThreatCones = !layer.showThreatCones',
  'showThreatCones: false',
]) {
  assert.ok(runtimeUi.includes(token), `runtime danger-cone contract must contain ${token}`);
}

for (const token of [
  'getSimulationLayerState',
  'toggleThreatCones',
  'dangerConeToggle',
  "dangerConeControls.dataset.role = 'danger-cone-controls'",
  'Конусы угроз: вкл',
  'Конусы угроз: выкл',
  'getSimulationLayerState(state).showThreatCones',
  'toggleThreatCones(state)',
]) {
  assert.ok(workspace.includes(token), `danger workspace shell must contain ${token}`);
}
for (const obsoleteToken of [
  "document.querySelector<HTMLButtonElement>('#vision-toggle')",
  'visionToggle.click()',
]) {
  assert.equal(workspace.includes(obsoleteToken), false, `danger toggle must not control legacy view cones: ${obsoleteToken}`);
}

for (const token of [
  'threatGeometryContainer: Container',
  'const layer = getSimulationLayerState(state)',
  "renderer.threatGeometryContainer.visible = layer.mode !== 'danger' || layer.showThreatCones",
]) {
  assert.ok(overlayRenderer.includes(token), `danger threat renderer must contain ${token}`);
}

assert.ok(app.includes('private showViewCones = false'), 'legacy view-cone renderer must remain disabled by default');
assert.ok(legacyViewConeRenderer.includes('this.clear();'), 'legacy view-cone compatibility renderer must stay inert');
assert.equal(
  legacyViewConeRenderer.includes('this.graphics.fill('),
  false,
  'danger sectors must not be implemented through the legacy view-cone renderer',
);

console.log('Danger threat cones smoke passed.');
