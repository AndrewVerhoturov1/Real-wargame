import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [productionEditor, workbench, adapter, inspector, participantEditor, scenePanel, roleEditor, workspaceTabs] = await Promise.all([
  readFile('src/ui/ProductionUnitEditor.ts', 'utf8'),
  readFile('src/ui/GameEditorWorkbench.ts', 'utf8'),
  readFile('src/combat-lab/editor/CombatLabSceneEditorAdapter.ts', 'utf8'),
  readFile('src/combat-lab/editor/CombatLabUnifiedInspectorHost.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabParticipantEditor.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabScenePanel.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabRoleEditor.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabWorkspaceTabs.ts', 'utf8'),
]);

assert.match(productionEditor, /createProductionUnitEditorSection/);
assert.match(productionEditor, /ProductionUnitEditorAdapterV1/);
assert.match(workbench, /createProductionUnitEditorSection/);
assert.match(workbench, /createGameWorkbenchUnitAdapter/);
assert.match(adapter, /mode = 'experiment_draft'/);
assert.match(adapter, /participantMutations\.update/);
assert.doesNotMatch(adapter, /restoreSimulationStateFromSceneSnapshot|replaceSceneAtRuntimeResolution|buildExportedScene/);
assert.match(inspector, /services\.selection\.subscribe/);
assert.match(inspector, /CombatLabSceneEditorAdapter/);
assert.match(scenePanel, /parametersHost:\s*options\.parametersHost/);
assert.match(roleEditor, /getCombatLabWorkspaceHosts\(located\.root\)\.parameters/);
assert.match(workspaceTabs, /workspaceHostsByRoot/);
assert.match(workspaceTabs, /getCombatLabWorkspaceHosts/);
assert.doesNotMatch(participantEditor, /CombatLabParticipantParametersPanel/);
assert.doesNotMatch(participantEditor, /parametersHost/);

console.log('Combat Lab scene editor adapter behavior smoke passed.');
