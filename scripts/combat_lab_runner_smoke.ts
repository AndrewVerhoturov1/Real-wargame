import assert from 'node:assert/strict';
import process from 'node:process';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import {
  COMBAT_LAB_FIXED_STEP_SECONDS,
  applyDueCombatLabProgramSteps,
  buildCombatLabInitialState,
  getCombatLabScenarioDefinition,
  runCombatLabScenario,
  runCombatLabScenarioWithFixedStep,
  type CombatLabProgramRuntimeV1,
  type CombatLabRunRequestV1,
} from '../src/core/testing/combat-lab';

const definition = getCombatLabScenarioDefinition('rifle-distance-baseline');
const request: CombatLabRunRequestV1 = {
  schemaVersion: 1,
  scenarioId: definition.scenarioId,
  scenarioRevision: definition.revision,
  seed: definition.defaultSeed,
  maximumSimulationSeconds: 8,
  stopCondition: { kind: 'time', maximumSimulationSeconds: 8 },
  mode: 'headless',
};

const first = runCombatLabScenario(request);
const second = runCombatLabScenario(request);
assert.deepEqual(second, first);
assert.equal(first.schemaVersion, 1);
assert.equal(first.scenarioId, request.scenarioId);
assert.equal(first.scenarioRevision, request.scenarioRevision);
assert.equal(first.seed, request.seed);
assert.equal(first.completed, true);
assert.ok(first.simulatedSeconds > 0);
assert.match(first.eventDigest, /^[0-9a-f]{16}$/);
assert.match(first.finalStateDigest, /^[0-9a-f]{16}$/);
assert.ok(first.metrics.shotsCommitted >= 1, JSON.stringify(buildRifleFireDiagnostic(), null, 2));
assert.equal(first.metrics.shotsCommitted, first.metrics.roundsConsumed);
assert.equal(first.metrics.shotsCommitted, first.metrics.projectilesCreated);

const differentSeed = runCombatLabScenario({ ...request, seed: request.seed + 1 });
assert.equal(differentSeed.seed, request.seed + 1);
assert.notEqual(differentSeed.finalStateDigest, first.finalStateDigest);

const coarse = runCombatLabScenarioWithFixedStep(request, 0.1);
const fine = runCombatLabScenarioWithFixedStep(request, 0.05);
assert.equal(coarse.finalStateDigest, fine.finalStateDigest);
assert.deepEqual(coarse.metrics, fine.metrics);

for (const scenarioId of [
  'rifle-moving-target',
  'ppsh-burst-recoil',
  'dp27-portable-deployed',
  'dp27-assistant-ammo',
  'wounds-first-aid',
  'suppression-events',
  'combat-save-load-boundaries',
]) {
  const current = getCombatLabScenarioDefinition(scenarioId);
  const result = runCombatLabScenario({
    schemaVersion: 1,
    scenarioId,
    scenarioRevision: current.revision,
    seed: current.defaultSeed,
    maximumSimulationSeconds: Math.min(12, current.defaultStopCondition.maximumSimulationSeconds),
    stopCondition: { kind: 'time', maximumSimulationSeconds: Math.min(12, current.defaultStopCondition.maximumSimulationSeconds) },
    mode: 'headless',
  });
  assert.equal(result.completed, true, scenarioId);
  assert.equal(result.scenarioId, scenarioId);
}

console.log('Combat Lab deterministic runner smoke passed.');
process.exit(0);

function buildRifleFireDiagnostic(): Record<string, unknown> {
  const built = buildCombatLabInitialState(definition.scenarioId, definition.revision, definition.defaultSeed);
  const runtime: CombatLabProgramRuntimeV1 = {
    appliedStepIds: new Set<string>(),
    nextStepIndex: 0,
    lastCommandResult: null,
  };
  const commandResults = applyDueCombatLabProgramSteps(built.state, built.definition, runtime);
  for (let step = 0; step < Math.ceil(8 / COMBAT_LAB_FIXED_STEP_SECONDS); step += 1) {
    applyDueCombatLabProgramSteps(built.state, built.definition, runtime);
    tickSimulation(built.state, COMBAT_LAB_FIXED_STEP_SECONDS);
  }
  const shooter = built.state.units.find((unit) => unit.id === 'rifle-distance-shooter');
  return {
    runResult: first,
    commandResults,
    lastCommandResult: runtime.lastCommandResult,
    shooterContacts: shooter?.perceptionKnowledge.contacts.map((contact) => ({
      id: contact.id,
      visibleNow: contact.visibleNow,
      observedNow: contact.observedNow,
      confidence: contact.confidence,
      lastKnownPosition: contact.lastKnownPosition,
    })),
    activeFireTask: shooter?.infantryCombatRuntime.activeFireTask,
    lastFireResult: shooter?.infantryCombatRuntime.lastFireResult,
    lastShotCommit: shooter?.infantryCombatRuntime.lastShotCommit,
    roundsInWeapon: shooter?.infantryCombatRuntime.primaryWeapon?.roundsInWeapon,
    committedShots: built.state.infantryCombatProjectiles.committedShots.length,
    activeProjectiles: built.state.infantryCombatProjectiles.activeProjectiles.length,
    impacts: built.state.infantryCombatProjectiles.impacts.length,
    simulationTimeSeconds: built.state.simulationTimeSeconds,
  };
}
