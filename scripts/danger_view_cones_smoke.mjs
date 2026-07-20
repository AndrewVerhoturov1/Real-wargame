import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');
const workspaceCss = readFileSync('src/tactical-workspace.css', 'utf8');
const app = readFileSync('src/rendering/PixiApp.ts', 'utf8');
const renderer = readFileSync('src/rendering/PixiViewConeRenderer.ts', 'utf8');

for (const token of [
  "document.querySelector<HTMLButtonElement>('#vision-toggle')",
  'danger-cone-controls',
  'Конусы угроз',
  'visionToggle',
]) {
  assert.ok(workspace.includes(token), `danger workspace must contain ${token}`);
}
assert.equal(
  workspace.includes("moveExistingButton('#vision-toggle', display)"),
  false,
  'the canonical cone toggle must no longer live in the global display menu',
);

for (const token of [
  '.danger-cone-controls',
  '#vision-toggle',
  'width: 100%',
]) {
  assert.ok(workspaceCss.includes(token), `danger cone CSS must contain ${token}`);
}

for (const token of [
  "import { getSimulationLayerState } from '../core/ui/RuntimeUiState'",
  "getSimulationLayerState(this.state).mode === 'danger'",
  "private showViewCones = false",
  "viewOn: 'Конусы угроз: вкл'",
  "viewOff: 'Конусы угроз: выкл'",
  'this.viewConeRenderer.clear()',
]) {
  assert.ok(app.includes(token), `Pixi app danger cone contract must contain ${token}`);
}

for (const token of [
  'private readonly graphics = new Graphics()',
  "this.container.addChild(this.graphics)",
  "private lastRenderKey = ''",
  'if (renderKey === this.lastRenderKey) return',
  'this.graphics.clear()',
  'this.graphics.fill(',
  'this.graphics.stroke(',
  'destroy(): void',
]) {
  assert.ok(renderer.includes(token), `retained view cone renderer must contain ${token}`);
}
assert.equal(
  renderer.includes('new Graphics();\n      this.container.addChild'),
  false,
  'renderer must not allocate one child Graphics object per unit per frame',
);

console.log('Danger view cones smoke passed.');
