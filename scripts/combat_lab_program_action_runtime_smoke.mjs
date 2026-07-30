import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTypescriptModule, makeExperiment } from './combat_lab_participant_test_support.mjs';

const executorSource = readFileSync('src/core/testing/combat-lab/experiment/CombatLabScenarioExecutor.ts', 'utf8');
const commandsSource = readFileSync('src/core/testing/combat-lab/CombatLabCommands.ts', 'utf8');
const radialSource = readFileSync('src/input/TacticalOrderRadialInput.ts', 'utf8');
const mapSource = readFileSync('src/combat-lab/scenario-editor/CombatLabMapAuthoringController.ts', 'utf8');
assert.match(executorSource, /tacticalOrderPresetId/);
assert.match(executorSource, /finalFacingRadians/);
assert.match(executorSource, /kind: 'face'/);
assert.match(executorSource, /kind: 'cancel_action'/);
assert.match(commandsSource, /issueTacticalOrderToSelectedUnits/);
assert.match(commandsSource, /faceSelectedUnitsToward/);
assert.match(commandsSource, /cancelTacticalOrderForUnit/);
assert.match(commandsSource, /cancelCombatLabWeaponAction/);
assert.doesNotMatch(commandsSource, /unit\.position\s*=|unit\.facingRadians\s*=\s*Math\.atan2/);
assert.match(radialSource, /sharedMapInputOwnership\.acquire\('tactical-orders'\)/);
assert.match(mapSource, /parameters:\s*\{ schemaVersion: 1, accuracy: null \}/);

const completion = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabScenarioCompletion.ts', {
  './CombatLabScenarioConditions': {
    evaluateCombatLabCondition: () => false,
    resolveCombatLabRoleUnit: (_experiment, state, roleId) => state.units.find((unit) => unit.roleId === roleId) ?? null,
  },
});
const experiment = makeExperiment({ roles: [{ roleId: 'actor', unitId: 'unit-actor', titleRu: 'Боец', parameters: { schemaVersion: 1, accuracy: null } }] });
const state = {
  simulationTimeSeconds: 0,
  map: { metersPerCell: 2 },
  units: [{
    id: 'unit-actor', roleId: 'actor', position: { x: 1, y: 1 }, facingRadians: 0, order: null,
    movementRuntime: { isMoving: false }, behaviorRuntime: { posture: 'standing', physicalAction: null },
    infantryCombatRuntime: {
      activeFireTask: null,
      lastFireResult: null,
      primaryWeapon: null,
      ammoInventory: { activeReload: null, activeTransfer: null, lastActionResult: null },
      medical: { activeFirstAidAction: null, lastFirstAidResult: null },
    },
  }],
  infantryCombatProjectiles: { committedShots: [], impacts: [], terminations: [] },
};
const observation = completion.captureCombatLabCompletionObservation(experiment, state, { kind: 'cancel_action', actorRoleId: 'actor', target: 'deployment' }, null, 0);
const result = completion.evaluateCombatLabCompletion(
  { kind: 'cancel_action', actorRoleId: 'actor', target: 'deployment' },
  { kind: 'production_action' },
  observation,
  { state },
);
assert.equal(result.status, 'completed', 'missing weapon must mean there is no deployment action left to cancel');

console.log('combat_lab_program_action_runtime_smoke: PASS');
