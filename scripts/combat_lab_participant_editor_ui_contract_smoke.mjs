import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeElement, installFakeDom, loadTypescriptModule } from './combat_lab_participant_test_support.mjs';

installFakeDom();

const participantInstances = [];
class FakeParticipantEditor {
  constructor(options) {
    this.options = options;
    this.root = new FakeElement('section');
    this.refreshCount = 0;
    this.destroyed = false;
    options.host.append(this.root);
    participantInstances.push(this);
  }
  refresh() { this.refreshCount += 1; }
  setSelectedStepAccuracyOverride() {}
  destroy() { this.destroyed = true; this.root.remove(); }
}

const inspectorInstances = [];
class FakeUnifiedInspectorHost {
  constructor(options) {
    this.options = options;
    this.renderCount = 0;
    this.destroyed = false;
    inspectorInstances.push(this);
  }
  render() { this.renderCount += 1; }
  destroy() { this.destroyed = true; }
}

const services = { selection: {}, participantMutations: {}, draft: {}, mapTools: {} };
const roleModule = loadTypescriptModule('src/combat-lab/scenario-editor/CombatLabRoleEditor.ts', {
  './CombatLabParticipantEditor': { CombatLabParticipantEditor: FakeParticipantEditor },
  '../editor/CombatLabUnifiedInspectorHost': { CombatLabUnifiedInspectorHost: FakeUnifiedInspectorHost },
  '../CombatLabWorkspaceServices': { getCombatLabWorkspaceServices: () => services },
});

const sceneHost = new FakeElement('div');
const parametersHost = new FakeElement('div');
const state = {};
const draft = {};
const editor = new roleModule.CombatLabRoleEditor({
  host: sceneHost,
  parametersHost,
  state,
  draft,
  getSelectedUnitId: () => null,
  onExperimentChanged: () => {},
  onError: () => {},
});

assert.equal(participantInstances.length, 1, 'Scene list must mount exactly one participant editor.');
assert.equal(inspectorInstances.length, 1, 'Parameters workspace must mount exactly one unified inspector.');
assert.equal(inspectorInstances[0].options.host, parametersHost, 'Unified inspector must live in the dedicated Parameters host.');
assert.equal(inspectorInstances[0].options.state, state);
assert.equal(inspectorInstances[0].options.services, services);

editor.render();
assert.equal(participantInstances[0].refreshCount, 1, 'Scene refresh must refresh the concise participant list.');
assert.equal(inspectorInstances[0].renderCount, 1, 'Scene refresh must refresh the canonical selection-driven inspector.');

editor.destroy();
assert.equal(participantInstances[0].destroyed, true);
assert.equal(inspectorInstances[0].destroyed, true);

const participantSource = readFileSync('src/combat-lab/scenario-editor/CombatLabParticipantEditor.ts', 'utf8');
assert.doesNotMatch(participantSource, /CombatLabParticipantParametersPanel|parametersHost/);
assert.match(participantSource, /Бойцы сцены/);
assert.match(participantSource, /Изменить/);
assert.match(participantSource, /Копировать/);
assert.match(participantSource, /Удалить/);

const adapterSource = readFileSync('src/combat-lab/editor/CombatLabSceneEditorAdapter.ts', 'utf8');
const inspectorSource = readFileSync('src/combat-lab/editor/CombatLabUnifiedInspectorHost.ts', 'utf8');
const productionEditorSource = readFileSync('src/ui/ProductionUnitEditor.ts', 'utf8');
const workbenchSource = readFileSync('src/ui/GameEditorWorkbench.ts', 'utf8');
assert.match(adapterSource, /mode = 'experiment_draft'/);
assert.match(adapterSource, /participantMutations\.update/);
assert.match(inspectorSource, /services\.selection\.subscribe/);
assert.match(inspectorSource, /createProductionUnitEditorSection/);
assert.match(productionEditorSource, /export function createProductionUnitEditorSection/);
assert.match(workbenchSource, /createProductionUnitEditorSection/);

const dialogSource = readFileSync('src/combat-lab/scenario-editor/CombatLabParticipantDialog.ts', 'utf8');
assert.match(dialogSource, /CombatLabParticipantDialogController\.open/);
assert.ok(dialogSource.split('\n').length < 90, 'Legacy participant dialog entry must remain a thin adapter.');

console.log('combat_lab_participant_editor_ui_contract_smoke: PASS');