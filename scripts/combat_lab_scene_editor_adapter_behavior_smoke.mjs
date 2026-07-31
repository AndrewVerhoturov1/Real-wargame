import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [productionEditor, workbench, adapter, inspector, participantEditor] = await Promise.all([
  readFile('src/ui/ProductionUnitEditor.ts', 'utf8'),
  readFile('src/ui/GameEditorWorkbench.ts', 'utf8'),
  readFile('src/combat-lab/editor/CombatLabSceneEditorAdapter.ts', 'utf8'),
  readFile('src/combat-lab/editor/CombatLabUnifiedInspectorHost.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabParticipantEditor.ts', 'utf8'),
]);

assert.match(productionEditor, /createProductionUnitEditorSection/);
assert.match(productionEditor, /ProductionUnitEditorAdapterV1/);
assert.match(workbench, /createProductionUnitEditorSection/);
assert.match(adapter, /mode:\s*'experiment_draft'/);
assert.match(adapter, /participantMutations\.update/);
assert.doesNotMatch(adapter, /restoreSimulationStateFromSceneSnapshot|replaceSceneAtRuntimeResolution|buildExportedScene/);
assert.match(inspector, /services\.selection\.subscribe/);
assert.match(inspector, /CombatLabSceneEditorAdapter/);
assert.doesNotMatch(participantEditor, /CombatLabParticipantParametersPanel/);
assert.doesNotMatch(participantEditor, /parametersHost/);

console.log('Combat Lab scene editor adapter behavior smoke passed.');