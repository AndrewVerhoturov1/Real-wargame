import assert from 'node:assert/strict';
import { loadTypescriptModule } from './combat_lab_participant_test_support.mjs';
import {
  FakeEvent,
  findControlByLabel,
  installCombatLabBehaviorDom,
} from './combat_lab_dom_behavior_test_support.mjs';

installCombatLabBehaviorDom();
const productionEditor = loadTypescriptModule('src/ui/ProductionUnitEditor.ts');
const participantMapTools = loadTypescriptModule('src/combat-lab/editor/CombatLabParticipantMapTools.ts');

assert.equal(
  typeof productionEditor.createProductionUnitEditorPositionScale,
  'function',
  'The shared editor must expose the canonical meter/cell boundary contract.',
);

const twoMetreScale = productionEditor.createProductionUnitEditorPositionScale(2);
assert.equal(twoMetreScale.coordinateConvention, 'cell_centre');
assert.equal(twoMetreScale.toDisplayMetres(10), 21, 'Cell-space x=10 represents a centre at 21 metres on a 2 m grid.');
assert.equal(twoMetreScale.toStorageCells(24), 11.5, 'A 24 metre centre must persist as cell-space x=11.5.');

const nonTwoMetreScale = productionEditor.createProductionUnitEditorPositionScale(1.5);
assert.equal(nonTwoMetreScale.toDisplayMetres(10), 15.75, 'The conversion must use the actual 1.5 m scale.');
assert.equal(nonTwoMetreScale.toStorageCells(24), 15.5, 'No hidden 2 m multiplier is allowed.');

const patches = [];
const adapter = {
  mode: 'experiment_draft',
  positionScale: twoMetreScale,
  read: () => snapshot(10, 5),
  update: (patch) => patches.push(patch),
  listGraphOptions: () => [],
};
const editor = productionEditor.createProductionUnitEditorSection(adapter, { showTitle: false });
const xInput = findControlByLabel(editor, 'X, м');
const yInput = findControlByLabel(editor, 'Y, м');
assert.ok(xInput && yInput, 'The shared editor must expose meter-labelled coordinate fields.');
assert.equal(xInput.value, '21');
assert.equal(yInput.value, '11');
xInput.value = '24';
xInput.dispatchEvent(new FakeEvent('change'));
assert.deepEqual(patches.at(-1), { x: 11.5 }, 'The adapter boundary must receive canonical cell-space.');

let placementPatch = null;
const contributor = participantMapTools.createCombatLabParticipantPlacementContributor({
  metersPerCell: 2,
  participantMutations: {
    update: (_roleId, callback) => {
      placementPatch = callback({ initial: { x: 10, y: 5 } }).scenePatch;
      return {};
    },
  },
  preview: { setParticipantPlacementPreview: () => undefined },
});
const transaction = contributor.createTransaction({ roleId: 'role-a', initialX: 10, initialY: 5 });
transaction.pin({ xMetres: 24, yMetres: 11 });
transaction.confirm();
assert.deepEqual(placementPatch, { x: 11.5, y: 5 }, 'Map placement and numeric fields must resolve the same physical centre.');

console.log('Combat Lab participant meter coordinates behavior smoke passed.');

function snapshot(x, y) {
  return {
    roleId: 'role-a',
    unitId: 'unit-a',
    titleRu: 'Боец А',
    side: 'blue',
    unitType: 'infantry_squad',
    x,
    y,
    facingDegrees: 0,
    posture: 'standing',
    behaviorProfile: 'regular',
    speedCellsPerSecond: 0.45,
    viewAngleDegrees: 110,
    viewRangeCells: 16,
    soldierTraits: {
      resilience: 50, caution: 50, decisiveness: 50, discipline: 50,
      initiative: 50, tactics: 50, weaponSkill: 50,
    },
    soldierCondition: {
      fatigue: 0, morale: 50, confusion: 0, health: 100, attention: 50,
      view: 50, intuition: 50, speed: 50, stealth: 50,
    },
    stress: 0,
    suppression: 0,
    loadoutRef: null,
    loadedRounds: 0,
    reserveRoundsByAmmoDefinitionId: {},
    firstAidCharges: 0,
    bloodLoss: 0,
    aiBrain: { schemaVersion: 1, kind: 'manual' },
  };
}
