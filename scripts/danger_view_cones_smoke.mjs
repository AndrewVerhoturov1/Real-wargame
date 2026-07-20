import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/ui/TacticalWorkspace.ts', 'utf8');
const app = readFileSync('src/rendering/PixiApp.ts', 'utf8');
const renderer = readFileSync('src/rendering/PixiViewConeRenderer.ts', 'utf8');

for (const token of [
  "document.querySelector<HTMLButtonElement>('#vision-toggle')",
  'dangerConeToggle',
  'data-role="danger-cone-controls"',
  'Конусы угроз: вкл',
  'Конусы угроз: выкл',
  '.workspace-display-panel #vision-toggle',
  'visionToggle.click()',
]) {
  assert.ok(workspace.includes(token), `danger workspace shell must contain ${token}`);
}

for (const token of [
  'private showViewCones = false',
  'this.viewConeRenderer.clear()',
]) {
  assert.ok(app.includes(token), `Pixi app cone state contract must contain ${token}`);
}

for (const token of [
  'private readonly graphics = new Graphics()',
  'this.container.addChild(this.graphics)',
  "private lastRenderKey = ''",
  'if (!isDangerWorkspaceTabActive())',
  '[data-tab="danger"].active',
  'if (renderKey === this.lastRenderKey) return',
  'this.graphics.clear()',
  'this.graphics.fill(',
  'this.graphics.stroke(',
  'destroy(): void',
]) {
  assert.ok(renderer.includes(token), `retained danger view cone renderer must contain ${token}`);
}
assert.equal(
  renderer.includes('new Graphics();\n      this.container.addChild'),
  false,
  'renderer must not allocate one child Graphics object per unit per frame',
);

console.log('Danger view cones smoke passed.');
