import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FakeElement,
  installFakeDom,
  loadTypescriptModule,
  makeExperiment,
  makeSceneUnit,
} from './combat_lab_participant_test_support.mjs';

const normalizedIds = [];
function normalizeUnits(records, scale = 1) {
  return records.map((record) => {
    normalizedIds.push(record.id);
    return {
      id: record.id,
      labels: { en: record.label ?? record.id, ru: record.labelRu ?? record.id },
      type: record.type,
      side: record.side,
      aiControl: 'manual',
      position: { x: (record.x + 0.5) * scale, y: (record.y + 0.5) * scale },
      speedCellsPerSecond: 0.5,
      playerCommand: null,
      plan: null,
      order: null,
      heldItem: 'long_item',
      facingRadians: 0,
      viewRangeCells: 7,
      behaviorProfile: 'default',
      behaviorSettings: {},
      behaviorRuntime: { posture: 'standing', previousPosture: 'standing', stress: 0, suppression: 0, ammo: 0, weaponReady: false, physicalAction: null, physicalActionCoordinator: {}, aiRuntimeSession: null, aiRouteStatusState: null },
      soldier: { traits: {}, condition: { health: 100 } },
      attentionSettings: { defaultMode: 'observe', profiles: { observe: { directAngleDegrees: 90 } }, vision: {}, nearAwarenessRangeMeters: 1, nearMinimumVisibilityQuality: 0 },
      playerAttentionProfileId: null,
      tacticalPositionSettings: {},
      initialState: { posture: 'standing' },
      tacticalKnowledge: {},
      perceptionKnowledge: {},
      movementRuntime: {},
      infantryCombatRuntime: {
        primaryWeapon: null,
        ammoInventory: { loadoutRef: null, reserves: [] },
        medical: { firstAidCharges: 0 },
        wounds: { slots: [] },
        physiology: { blood: { state: 'stable', bloodLoss: 0 } },
      },
      unitRoleNavigationProfileId: null,
      playerNavigationProfileId: null,
      navigationMovementMode: null,
      unitRoleMovementProfileId: null,
    };
  });
}

const readStubs = {
  '../../../units/UnitModel': { normalizeUnits },
  '../../../ai/runtime/AiRuntimeSnapshot': { buildAiRuntimeSceneSnapshot: () => null, serializeMoveOrder: (value) => value },
  '../../../actions/PhysicalActionCoordinatorSerialization': { serializePhysicalActionCoordinatorState: (value) => value },
  '../../../actions/PostureTransition': { serializeUnitPhysicalAction: (value) => value },
  '../../../combat/CombatDamage': { getCombatRuntime: () => ({}) },
  '../../../combat/WeaponModel': { getWeaponRuntime: () => ({}) },
  '../../../infantry-combat/runtime': { serializeInfantryCombatUnitRuntime: (value) => value },
  '../../../movement/MovementRuntime': { serializeMovementRuntime: (value) => value },
  '../../../tactical/TacticalPositionSettings': { serializeTacticalPositionSettings: () => ({}) },
  './CombatLabParticipantInitialRuntime': {},
};
const scene = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabParticipantSceneRuntime.ts', readStubs);
const roles = Array.from({ length: 10 }, (_, index) => ({
  roleId: `role-${index}`,
  unitId: `unit-${index}`,
  titleRu: `Боец ${index}`,
  parameters: { schemaVersion: 1, accuracy: null },
}));
const experiment = makeExperiment({ roles, units: roles.map((role, index) => makeSceneUnit(role.unitId, index)) });
const readCounts = new Map();
const normalizeCounts = new Map();
const summaries = scene.readCombatLabParticipantInitialSummaries(experiment, {
  onUnitRecordRead: (unitId) => readCounts.set(unitId, (readCounts.get(unitId) ?? 0) + 1),
  onUnitNormalized: (unitId) => normalizeCounts.set(unitId, (normalizeCounts.get(unitId) ?? 0) + 1),
});
assert.equal(summaries.length, 10);
assert.equal(normalizedIds.length, 10);
for (const role of roles) {
  assert.equal(readCounts.get(role.unitId), 1, `${role.unitId}: запись должна читаться один раз`);
  assert.equal(normalizeCounts.get(role.unitId), 1, `${role.unitId}: запись должна нормализоваться один раз`);
}

const forbiddenSource = [
  'src/core/testing/combat-lab/experiment/CombatLabParticipantSceneRuntime.ts',
  'src/core/testing/combat-lab/experiment/CombatLabParticipantSceneSupport.ts',
  'src/combat-lab/scenario-editor/CombatLabParticipantEditor.ts',
  'src/combat-lab/scenario-editor/CombatLabParticipantDialog.ts',
  'src/combat-lab/scenario-editor/CombatLabParticipantParametersPanel.ts',
].map((path) => readFileSync(path, 'utf8')).join('\n');
assert.doesNotMatch(forbiddenSource, /restoreSimulationStateFromSceneSnapshot|buildSceneSnapshot|createInitialState/);

installFakeDom();
class ParametersPanelStub {
  constructor(options) {
    this.root = new FakeElement('section');
    this.root.dataset.kind = 'parameters';
    options.host.append(this.root);
  }
  setStepAccuracyOverride() {}
  destroy() { this.root.remove(); }
}
const editorExperimentApi = {
  readCombatLabParticipantInitialSummaries: (value) => value.roles.map((role) => ({
    roleId: role.roleId,
    unitId: role.unitId,
    titleRu: role.titleRu,
    side: 'blue',
    posture: 'standing',
    weaponNameRu: null,
    loadedRounds: 0,
    reserveRounds: 0,
    healthRu: 'Здоров',
  })),
  collectCombatLabParticipantProgramReferences: () => [],
  duplicateCombatLabParticipant: (value) => value,
  removeCombatLabParticipant: (value) => value,
};
const editorStubs = {
  '../../core/testing/combat-lab/experiment': editorExperimentApi,
  '../../core/testing/combat-lab': {},
  './CombatLabParticipantDialog': { CombatLabParticipantDialog: { open: () => null } },
  './CombatLabParticipantParametersPanel': { CombatLabParticipantParametersPanel: ParametersPanelStub },
};
const { CombatLabRoleEditor } = loadTypescriptModule('src/combat-lab/scenario-editor/CombatLabRoleEditor.ts', editorStubs);
const host = new FakeElement('div');
const parametersHost = new FakeElement('div');
const draft = { getExperiment: () => experiment, replaceExperiment: () => {} };
const editor = new CombatLabRoleEditor({
  host,
  parametersHost,
  state: {},
  draft,
  getSelectedUnitId: () => null,
  onExperimentChanged: () => {},
  onError: (message) => { throw new Error(message); },
});
assert.ok(host.children.includes(editor.root));
assert.equal(editor.root.children.includes(parametersHost), false);
assert.equal(parametersHost.children.some((child) => child.dataset.kind === 'parameters'), true);
editor.destroy();

const fallbackHost = new FakeElement('div');
const fallbackEditor = new CombatLabRoleEditor({
  host: fallbackHost,
  state: {},
  draft,
  getSelectedUnitId: () => null,
  onExperimentChanged: () => {},
  onError: (message) => { throw new Error(message); },
});
assert.equal(fallbackHost.children.some((child) => child.dataset.combatLabParametersHost === 'selected-unit-fallback'), true);
fallbackEditor.destroy();

const dialog = loadTypescriptModule('src/combat-lab/scenario-editor/CombatLabParticipantDialog.ts', {
  '../../core/infantry-combat/catalogs/CombatCatalogRegistry': { createDefaultCombatCatalogRegistry: () => ({ listLoadoutTemplates: () => [] }) },
  '../../core/testing/combat-lab/experiment': {},
});
assert.equal(dialog.combatLabParticipantAllowsUnarmedSelection(null), true);
assert.equal(dialog.combatLabParticipantAllowsUnarmedSelection('existing-role'), false);

console.log('combat_lab_participant_editor_ui_contract_smoke: PASS');
