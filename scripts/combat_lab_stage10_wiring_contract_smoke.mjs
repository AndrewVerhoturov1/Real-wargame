import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [extension, renderer, editor, packageJson] = await Promise.all([
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
  readFile('package.json', 'utf8'),
]);

for (const marker of [
  'new CombatLabExperimentDraft(initialExperiment)',
  'CombatLabExperimentVisualController.create({',
  'this.batchClient = new CombatLabBatchClient()',
  'CombatLabMapAuthoringController.create({',
  'new CombatLabScenarioAuthoringOverlayRenderer(world)',
  'new CombatLabScenePanel({',
  'CombatLabScenarioEditorPanel.create({',
  'CombatLabExperimentRunToolbar.create({',
  'CombatLabScenarioRuntimeStatus.create({',
  'new CombatLabBatchPanel({',
  'new CombatLabBatchResultsView({',
]) assert.match(`${extension}\n${renderer}`, new RegExp(escapeRegExp(marker)));

assert.equal((extension.match(/new CombatLabExperimentDraft\(/g) ?? []).length, 1, 'Composition root must own one draft.');
assert.equal((extension.match(/CombatLabExperimentVisualController\.create\(/g) ?? []).length, 1, 'Composition root must own one visual controller.');
assert.equal((extension.match(/new CombatLabBatchClient\(/g) ?? []).length, 1, 'Composition root must own one batch client.');
assert.equal((extension.match(/CombatLabMapAuthoringController\.create\(/g) ?? []).length, 1, 'Composition root must own one map authoring controller.');
assert.doesNotMatch(extension, /toolbar\.children\[/, 'Stage 10 wiring must use named hosts instead of positional toolbar children.');
assert.match(extension, /legacyLayout\.top\.replaceChildren\(\)/, 'Legacy visual/headless/program controls must not remain mounted.');
assert.match(extension, /getExperiment:\s*\(\)\s*=>\s*this\.draft\.getExperiment\(\)/);
assert.match(extension, /validateCombatLabExperiment\(this\.draft\.getExperiment\(\)\)/);
assert.match(extension, /this\.batchClient\.cancel\(\)/, 'Experiment changes must invalidate an active batch.');
assert.match(extension, /this\.batchResults\.clear\(\)/, 'Experiment changes must clear stale batch presentation.');
assert.match(editor, /isMutationAllowed\?:\s*\(\)\s*=>\s*boolean/);
assert.match(packageJson, /"combat-lab-scenario-system:verify"/);

console.log('Combat Lab Stage 10 composition-root wiring contract passed.');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
