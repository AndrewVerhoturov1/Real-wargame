import assert from 'node:assert/strict';
import process from 'node:process';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import {
  COMBAT_LAB_FIXED_STEP_SECONDS,
  COMBAT_LAB_SCENARIO_IDS,
  applyDueCombatLabProgramSteps,
  buildCombatLabInitialState,
  digestCombatLabEvents,
  digestCombatLabState,
  getCombatLabScenarioDefinition,
  listCombatLabScenarioDefinitions,
  type CombatLabProgramRuntimeV1,
} from '../src/core/testing/combat-lab';
import { CombatLabVisualSession } from '../src/combat-lab/runtime/CombatLabVisualSession';

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
  assert.ok(Number.isInteger(definition.defaultSeed) && definition.defaultSeed > 0);
  assert.ok(definition.manualStepsRu.length >= 2 && definition.manualStepsRu.length <= 5);
  assert.ok(definition.supportedMetrics.length > 0);
  assert.ok(!definition.supportedMetrics.some((metricId) => metricId.includes('moderate')));
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

const medical = buildCombatLabInitialState('wounds-first-aid', 1, 9046);
const medicalActor = medical.state.units.find((unit) => unit.id === 'medical-actor')!;
const medicalPatient = medical.state.units.find((unit) => unit.id === 'medical-patient')!;
assert.equal(medicalActor.infantryCombatRuntime.medical.firstAidCharges, 2);
assert.deepEqual(
  medicalPatient.infantryCombatRuntime.wounds.slots.map((slot) => slot.zone).sort(),
  ['arms', 'head', 'legs', 'torso'],
);
assert.ok(medicalPatient.infantryCombatRuntime.wounds.slots.some((slot) => slot.severity === 'critical'));

const saveLoadDefinition = getCombatLabScenarioDefinition('combat-save-load-boundaries');
assert.ok(
  saveLoadDefinition.roles.some(
    (role) => role.unitId === 'save-rifleman' && role.selectableAs.includes('first_aid_actor'),
  ),
);

const visualSession = new CombatLabVisualSession('rifle-distance-baseline', 9041);
const stableVisualState = visualSession.state;
visualSession.startNewRun('ppsh-burst-recoil', 9043);
assert.equal(visualSession.state, stableVisualState, 'Visual scenario replacement must preserve SimulationState identity.');
assert.equal(visualSession.definition.scenarioId, 'ppsh-burst-recoil');
assert.ok(visualSession.state.units.some((unit) => unit.id === 'ppsh-shooter'));

const normalOrder = runRifleOrderVariant(false);
const reverseOrder = runRifleOrderVariant(true);
assert.equal(reverseOrder.stateDigest, normalOrder.stateDigest);
assert.equal(reverseOrder.eventDigest, normalOrder.eventDigest);

assert.throws(() => getCombatLabScenarioDefinition('missing-scenario'), /Unknown Combat Lab scenario/);
console.log('Combat Lab scenario registry smoke passed.');
process.exit(0);

function runRifleOrderVariant(reverseUnits: boolean): { readonly stateDigest: string; readonly eventDigest: string } {
  const built = buildCombatLabInitialState('rifle-distance-baseline', 1, 9041);
  if (reverseUnits) built.state.units.reverse();
  const runtime: CombatLabProgramRuntimeV1 = {
    appliedStepIds: new Set<string>(),
    nextStepIndex: 0,
    lastCommandResult: null,
  };
  for (let step = 0; step < 240; step += 1) {
    applyDueCombatLabProgramSteps(built.state, built.definition, runtime);
    tickSimulation(built.state, COMBAT_LAB_FIXED_STEP_SECONDS);
  }
  return {
    stateDigest: digestCombatLabState(built.state),
    eventDigest: digestCombatLabEvents(built.state),
  };
}
