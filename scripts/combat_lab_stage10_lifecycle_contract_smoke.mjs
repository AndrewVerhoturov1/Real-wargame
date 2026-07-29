import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [extension, renderer, editor] = await Promise.all([
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
]);

for (const call of [
  'this.batchPanel.destroy()',
  'this.batchResults.destroy()',
  'this.runToolbar.destroy()',
  'this.runtimeStatus.destroy()',
  'this.scenePanel.destroy()',
  'this.editorPanel.destroy()',
  'this.visualController.destroy()',
  'this.batchClient.destroy()',
  'this.currentMetrics.destroy()',
  'this.sharedSimulationControls.destroy()',
  'this.renderer.destroy()',
]) assert.match(extension, new RegExp(escapeRegExp(call)));

assert.match(extension, /this\.mapAuthoringController\?\.destroy\(\)/);
assert.match(extension, /if \(this\.destroyed\) return;\s*this\.destroyed = true;/);
assert.match(extension, /observer\.disconnect\(\)/, 'Metrics MutationObserver must disconnect.');
assert.match(extension, /removeEventListener/, 'Composition-root listeners must be removable.');
assert.match(renderer, /this\.authoringOverlay\.destroy\(\)/);
assert.match(renderer, /this\.removeLabTicker\(\)/);
assert.match(renderer, /this\.removeViewportStabilizer\(\)/);
assert.match(editor, /window\.removeEventListener\('keydown'/);
assert.match(editor, /this\.options\.onSelectionChanged\?\.\(null\)/);

const destroySection = extension.slice(extension.indexOf('destroy(): void {'), extension.indexOf('private readonly handleRuntimeChanged'));
assert.ok(destroySection.indexOf('this.visualController.destroy()') < destroySection.indexOf('this.renderer.destroy()'), 'Visual hooks must be removed before renderer teardown.');
assert.ok(destroySection.indexOf('this.batchClient.destroy()') < destroySection.indexOf('this.renderer.destroy()'), 'Workers and timers must stop before renderer teardown.');

console.log('Combat Lab Stage 10 symmetric lifecycle contract passed.');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
