import assert from 'node:assert/strict';
import { loadTypescriptModule } from './combat_lab_participant_test_support.mjs';
import {
  findControlByLabel,
  findDetailsBySummary,
  installCombatLabBehaviorDom,
  walkElements,
} from './combat_lab_dom_behavior_test_support.mjs';

installCombatLabBehaviorDom();
const productionEditor = loadTypescriptModule('src/ui/ProductionUnitEditor.ts');
const adapter = {
  mode: 'experiment_draft',
  positionScale: productionEditor.createProductionUnitEditorPositionScale(2),
  read: () => snapshot(),
  update: () => undefined,
  listGraphOptions: () => [],
};
const root = productionEditor.createProductionUnitEditorSection(adapter, { showTitle: true });
const technical = findDetailsBySummary(root, 'Технические сведения');
assert.equal(technical.open, false, 'Technical details must be collapsed by default.');
assert.ok(technical.textContent.includes('role-internal-17'));
assert.ok(technical.textContent.includes('unit-internal-29'));

const roleControl = findControlByLabel(technical, 'roleId');
const unitControl = findControlByLabel(technical, 'unitId');
assert.equal(roleControl?.readOnly, true);
assert.equal(unitControl?.readOnly, true);
assert.equal(roleControl?.disabled, false, 'Read-only IDs must remain keyboard-readable.');
assert.equal(unitControl?.disabled, false, 'Read-only IDs must remain keyboard-readable.');

const outsideTechnical = walkElements(root)
  .filter((element) => element !== technical && !isDescendantOf(element, technical))
  .map((element) => element._textContent ?? '')
  .join(' ');
assert.doesNotMatch(outsideTechnical, /role-internal-17|unit-internal-29/, 'IDs must not leak into the primary header or normal sections.');

const idInputs = walkElements(root).filter((element) => element.tagName === 'INPUT'
  && (element.value === 'role-internal-17' || element.value === 'unit-internal-29'));
assert.equal(idInputs.length, 2);
assert.ok(idInputs.every((input) => input.readOnly), 'No editable ID field may exist.');

console.log('Combat Lab participant technical details DOM smoke passed.');

function isDescendantOf(element, ancestor) {
  let current = element.parentNode;
  while (current) {
    if (current === ancestor) return true;
    current = current.parentNode;
  }
  return false;
}

function snapshot() {
  return {
    roleId: 'role-internal-17',
    unitId: 'unit-internal-29',
    titleRu: 'Читаемое имя',
    side: 'blue',
    unitType: 'infantry_squad',
    x: 0,
    y: 0,
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
