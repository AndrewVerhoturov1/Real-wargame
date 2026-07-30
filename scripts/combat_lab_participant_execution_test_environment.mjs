import {
  loadTypescriptModule,
  makeExperiment,
  makeFireStep,
  stableDigest,
} from './combat_lab_participant_test_support.mjs';

let capturedCommands = [];
let capturedResults = [];
const executorStubs = {
  '../CombatLabCommands': {
    executeCombatLabCommand: (_state, command, context) => {
      capturedCommands.push(structuredClone(command));
      const result = Object.freeze({
        accepted: true,
        ownerToken: context.ownerId,
        reasonCode: 'accepted',
        reasonRu: 'Принято.',
        command: structuredClone(command),
      });
      capturedResults.push(structuredClone(result));
      return result;
    },
  },
  './CombatLabExperimentValidation': { validateCombatLabExperiment: () => [] },
  './CombatLabScenarioConditions': { evaluateCombatLabCondition: () => true },
  './CombatLabScenarioCompletion': {
    captureCombatLabCompletionObservation: (_experiment, _state, _action, _ownerToken, startedSeconds) => ({ startedSeconds }),
    evaluateCombatLabCompletion: () => ({ status: 'completed', reasonCode: 'completed', reasonRu: 'Завершено.' }),
  },
};
const parameters = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabParticipantParameters.ts');
const { CombatLabScenarioExecutor } = loadTypescriptModule(
  'src/core/testing/combat-lab/experiment/CombatLabScenarioExecutor.ts',
  executorStubs,
);
const digest = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabExperimentDigest.ts', {
  '../CombatLabDigest': { digestStableValue: stableDigest },
});

function fixture({ defaultsAccuracy = null, participantAccuracy = null, stepAccuracy = null, twoTracks = false } = {}) {
  const roles = [
    { roleId: 'bravo', unitId: 'unit-bravo', titleRu: 'Браво', parameters: { schemaVersion: 1, accuracy: participantAccuracy } },
    { roleId: 'alpha', unitId: 'unit-alpha', titleRu: 'Альфа', parameters: { schemaVersion: 1, accuracy: null } },
  ];
  const tracks = [{
    trackId: 'track-bravo',
    titleRu: 'Браво',
    actorRoleId: 'bravo',
    enabled: true,
    steps: [makeFireStep('fire-bravo', 'bravo', stepAccuracy)],
  }];
  if (twoTracks) tracks.push({
    trackId: 'track-alpha',
    titleRu: 'Альфа',
    actorRoleId: 'alpha',
    enabled: true,
    steps: [makeFireStep('fire-alpha', 'alpha', null)],
  });
  const experiment = makeExperiment({ roles, tracks, defaultsAccuracy });
  experiment.markers = [{ markerId: 'target', kind: 'point', titleRu: 'Цель', xMetres: 10, yMetres: 2, zMetres: 1 }];
  return experiment;
}

function execute(experiment) {
  capturedCommands = [];
  capturedResults = [];
  const state = { simulationTimeSeconds: 0, map: { metersPerCell: 2 } };
  const executor = CombatLabScenarioExecutor.create(experiment, state);
  const results = executor.beforeSimulationStep();
  state.simulationTimeSeconds = 0.1;
  executor.afterSimulationStep();
  return {
    commands: structuredClone(capturedCommands),
    results: structuredClone(results),
    snapshot: executor.getSnapshot(),
    digest: stableDigest({ commands: capturedCommands, results, snapshot: executor.getSnapshot() }),
  };
}

const runner = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts', {
  '../../../simulation/SimulationTick': { tickSimulation: (state, deltaSeconds) => { state.simulationTimeSeconds += deltaSeconds; } },
  '../../../simulation/SimulationState': { createInitialState: () => ({ simulationTimeSeconds: 0, map: { metersPerCell: 2 } }) },
  '../../../simulation/SceneSnapshot': { restoreSimulationStateFromSceneSnapshot: (state, snapshot) => { state.simulationTimeSeconds = snapshot.simulationTimeSeconds; state.map = { metersPerCell: snapshot.map.metersPerCell }; } },
  '../CombatLabContracts': { COMBAT_LAB_FIXED_STEP_SECONDS: 0.1 },
  '../CombatLabDigest': {
    digestCombatLabEvents: () => stableDigest(capturedResults),
    digestCombatLabState: (state) => stableDigest({ simulationTimeSeconds: state.simulationTimeSeconds }),
    digestStableValue: stableDigest,
  },
  '../CombatLabMetrics': {
    createCombatLabMetricCollector: () => ({}),
    finalizeCombatLabMetrics: () => ({ simulatedSeconds: 0 }),
    observeCombatLabMetrics: () => {},
  },
  './CombatLabExperimentDigest': digest,
  './CombatLabParticipantParameters': parameters,
  './CombatLabScenarioExecutor': { CombatLabScenarioExecutor },
  './CombatLabExperimentValidation': { validateCombatLabExperiment: () => [] },
});

class JournalStub {
  constructor() { this.results = []; }
  clear() { this.results = []; }
  recordTransitions(_experiment, _previous, _next, results = []) { this.results.push(...structuredClone(results)); return []; }
  snapshot() { return structuredClone(this.results); }
}
const visualModule = loadTypescriptModule('src/combat-lab/runtime/CombatLabExperimentVisualController.ts', {
  '../../core/testing/combat-lab': { CombatLabScenarioExecutor, prepareCombatLabExperimentForRun: parameters.prepareCombatLabExperimentForRun },
  './CombatLabVisualSession': { COMBAT_LAB_VISUAL_SPEEDS: [1] },
  './CombatLabExperimentRunState': {
    CombatLabExperimentRunJournal: JournalStub,
    buildCombatLabExperimentVisualSnapshot: ({ core }) => core,
  },
});

function runHeadlessPath(experiment, runSeed) {
  capturedCommands = [];
  capturedResults = [];
  const result = runner.runCombatLabExperiment({ schemaVersion: 1, experiment, seed: runSeed, maximumSimulationSeconds: 2 });
  return {
    commands: structuredClone(capturedCommands),
    results: structuredClone(capturedResults),
    result,
    digest: stableDigest({ commands: capturedCommands, results: capturedResults }),
  };
}

function runVisualPath(experiment, runSeed) {
  capturedCommands = [];
  capturedResults = [];
  let latest = null;
  const session = {
    state: { simulationTimeSeconds: 0, map: { metersPerCell: 2 } },
    paused: true,
    setStepHooks: () => {},
    clearStepHooks: () => {},
    enableRecommendedProgram: () => {},
    setPaused(value) { this.paused = value; },
    isPaused() { return this.paused; },
    resetExperimentScene(snapshot) { this.state.simulationTimeSeconds = snapshot.simulationTimeSeconds; this.state.map = { metersPerCell: snapshot.map.metersPerCell }; },
    getSpeed: () => 1,
    setSpeed: () => {},
    appendRunJournal: () => {},
    cancelActionsOwnedBy: () => {},
    stepOnce: () => false,
  };
  const controller = visualModule.CombatLabExperimentVisualController.create({
    session,
    getExperiment: () => experiment,
    onRuntimeChanged: (snapshot) => { latest = structuredClone(snapshot); },
  });
  controller.reset(runSeed);
  controller.beforeSimulationStep();
  session.state.simulationTimeSeconds += 0.1;
  controller.afterSimulationStep();
  const output = {
    commands: structuredClone(capturedCommands),
    results: structuredClone(capturedResults),
    snapshot: latest,
    digest: stableDigest({ commands: capturedCommands, results: capturedResults }),
  };
  controller.destroy();
  return output;
}

export { parameters, digest, fixture, execute, runHeadlessPath, runVisualPath };
