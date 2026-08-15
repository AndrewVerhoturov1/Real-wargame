import assert from 'node:assert/strict';
import {
  createEmptyCombatLabLaboratoryState,
  listApplicableCombatLabLaboratoryOverrides,
  removeCombatLabLaboratoryArea,
  removeCombatLabLaboratoryOverride,
  resolveCombatLabLaboratoryValue,
  upsertCombatLabLaboratoryArea,
  upsertCombatLabLaboratoryOverride,
} from '../src/combat-lab/parameters/CombatLabLaboratoryRuntime';

let state = createEmptyCombatLabLaboratoryState();
state = upsertCombatLabLaboratoryArea(state, {
  areaId: 'area-left',
  titleRu: 'Левая зона',
  vertices: [
    { xMetres: 0, yMetres: 0 },
    { xMetres: 10, yMetres: 0 },
    { xMetres: 10, yMetres: 10 },
    { xMetres: 0, yMetres: 10 },
  ],
});
state = upsertCombatLabLaboratoryOverride(state, {
  overrideId: 'area-dispersion',
  parameterId: 'accuracy.dispersion_multiplier',
  target: { kind: 'area', areaId: 'area-left' },
  value: 1.5,
  enabled: true,
});
state = upsertCombatLabLaboratoryOverride(state, {
  overrideId: 'group-dispersion',
  parameterId: 'accuracy.dispersion_multiplier',
  target: { kind: 'participants', roleIds: ['role-a', 'role-b'] },
  value: 1.25,
  enabled: true,
});
state = upsertCombatLabLaboratoryOverride(state, {
  overrideId: 'personal-dispersion',
  parameterId: 'accuracy.dispersion_multiplier',
  target: { kind: 'participant', roleId: 'role-a' },
  value: 0.75,
  enabled: true,
});

const roleA = { roleId: 'role-a', xMetres: 5, yMetres: 5 } as const;
const roleB = { roleId: 'role-b', xMetres: 50, yMetres: 50 } as const;
const roleC = { roleId: 'role-c', xMetres: 5, yMetres: 5 } as const;

assert.deepEqual(
  listApplicableCombatLabLaboratoryOverrides(state, 'accuracy.dispersion_multiplier', roleA).map((item) => item.overrideId),
  ['area-dispersion', 'group-dispersion', 'personal-dispersion'],
);
assert.equal(resolveCombatLabLaboratoryValue(state, 'accuracy.dispersion_multiplier', roleA, 1).baselineValue, 1);
assert.equal(resolveCombatLabLaboratoryValue(state, 'accuracy.dispersion_multiplier', roleA, 1).effectiveValue, 0.75);
assert.equal(resolveCombatLabLaboratoryValue(state, 'accuracy.dispersion_multiplier', roleA, 1).effectiveOverrideId, 'personal-dispersion');
assert.equal(resolveCombatLabLaboratoryValue(state, 'accuracy.dispersion_multiplier', roleB, 1).effectiveValue, 1.25);
assert.equal(resolveCombatLabLaboratoryValue(state, 'accuracy.dispersion_multiplier', roleC, 1).effectiveValue, 1.5);

assert.throws(() => removeCombatLabLaboratoryArea(state, 'area-left'), /is used by 1 override/);
state = removeCombatLabLaboratoryOverride(state, 'area-dispersion');
state = removeCombatLabLaboratoryArea(state, 'area-left');
assert.equal(state.areas.length, 0);

console.log('Combat Lab Laboratory runtime behavior smoke passed.');
