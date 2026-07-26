import assert from 'node:assert/strict';
import {
  COMBAT_LAB_SCENARIO_IDS,
  buildCombatLabInitialState,
  digestCombatLabState,
  getCombatLabScenarioDefinition,
  listCombatLabScenarioDefinitions,
} from '../src/core/testing/combat-lab';

const expectedIds = [
  'rifle-distance-baseline',
  'rifle-moving-target',
  'ppsh-burst-recoil',
  'dp27-portable-deployed',
  'dp27-assistant-ammo',
  'wounds-first-aid',
  'suppression-events',
  'combat-save-load-boundaries',
] as const;

assert.deepEqual(COMBAT_LAB_SCENARIO_IDS, expectedIds);
const definitions = listCombatLabScenarioDefinitions();
assert.equal(definitions.length, expectedIds.length);
assert.equal(new Set(definitions.map((item) => item.scenarioId)).size, definitions.length);

for (const definition of definitions) {
  assert.equal(definition.schemaVersion, 1);
  assert.ok(definition.revision >= 1);
  assert.ok(definition.titleRu.length > 0);
  assert.ok(definition.descriptionRu.length > 0);
  assert.ok(definition.defaultSeed > 0);
  assert.ok(definition.manualStepsRu.length >= 2 && definition.manualStepsRu.length <= 5);
  assert.ok(definition.supportedMetrics.length > 0);
  const first = buildCombatLabInitialState(definition.scenarioId, definition.revision, definition.defaultSeed);
  const second = buildCombatLabInitialState(definition.scenarioId, definition.revision, definition.defaultSeed);
  assert.equal(digestCombatLabState(first.state), digestCombatLabState(second.state));
  assert.equal(first.definition.scenarioId, definition.scenarioId);
  assert.equal(first.definition.revision, definition.revision);
  assert.ok(first.roles.length > 0);
  for (const distance of first.controlDistances) {
    const from = first.state.units.find((unit) => unit.id === distance.fromUnitId)!;
    const to = first.state.units.find((unit) => unit.id === distance.toUnitId)!;
    const actual = Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y)
      * first.state.map.metersPerCell;
    assert.ok(Math.abs(actual - distance.metres) <= 0.01, `${definition.scenarioId}: ${distance.labelRu}`);
  }
  const reversed = buildCombatLabInitialState(definition.scenarioId, definition.revision, definition.defaultSeed);
  reversed.state.units.reverse();
  assert.equal(digestCombatLabState(reversed.state), digestCombatLabState(first.state));
}

const rifle = buildCombatLabInitialState('rifle-distance-baseline', 1, 9041);
const rifleman = rifle.state.units.find((unit) => unit.id === 'rifle-distance-shooter')!;
assert.equal(rifleman.infantryCombatRuntime.ammoInventory.loadoutRef?.definitionId, 'loadout_rifleman');
assert.equal(rifleman.infantryCombatRuntime.ammoInventory.loadoutRef?.revision, 1);

const ppsh = buildCombatLabInitialState('ppsh-burst-recoil', 1, 9043);
assert.equal(
  ppsh.state.units.find((unit) => unit.id === 'ppsh-shooter')?.infantryCombatRuntime.ammoInventory.loadoutRef?.definitionId,
  'loadout_submachine_gunner',
);

const dp = buildCombatLabInitialState('dp27-assistant-ammo', 1, 9045);
assert.equal(
  dp.state.units.find((unit) => unit.id === 'dp-assistant-gunner')?.infantryCombatRuntime.ammoInventory.loadoutRef?.definitionId,
  'loadout_machine_gunner',
);
assert.equal(
  dp.state.units.find((unit) => unit.id === 'dp-assistant-helper')?.infantryCombatRuntime.ammoInventory.loadoutRef?.definitionId,
  'loadout_assistant_machine_gunner',
);

assert.throws(() => getCombatLabScenarioDefinition('missing-scenario'), /Unknown Combat Lab scenario/);
console.log('Combat Lab scenario registry smoke passed.');
