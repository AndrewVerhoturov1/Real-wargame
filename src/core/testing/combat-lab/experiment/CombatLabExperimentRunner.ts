import { tickSimulation } from '../../../simulation/SimulationTick';
import { createInitialState, type SimulationState } from '../../../simulation/SimulationState';
import { restoreSimulationStateFromSceneSnapshot } from '../../../simulation/SceneSnapshot';
import { COMBAT_LAB_FIXED_STEP_SECONDS, type CombatLabCommandResultV1 } from '../CombatLabContracts';
import { digestCombatLabEvents, digestCombatLabState, digestStableValue } from '../CombatLabDigest';
import {
  createCombatLabMetricCollector,
  finalizeCombatLabMetrics,
  observeCombatLabMetrics,
} from '../CombatLabMetrics';
import type { CombatLabExperimentRunRequestV1, CombatLabExperimentRunResultV1 } from './CombatLabBatchContracts';
import type { CombatLabExperimentV1 } from './CombatLabExperimentContracts';
import { digestCombatLabExperiment } from './CombatLabExperimentDigest';
import { prepareCombatLabExperimentForRun } from './CombatLabParticipantParameters';
import { CombatLabScenarioExecutor } from './CombatLabScenarioExecutor';
import { validateCombatLabExperiment } from './CombatLabExperimentValidation';

const MAX_UINT32 = 0xffff_ffff;
const EPSILON_SECONDS = 1e-9;

export function runCombatLabExperiment(
  request: CombatLabExperimentRunRequestV1,
): CombatLabExperimentRunResultV1 {
  validateRunRequest(request);
  const validationErrors = validateCombatLabExperiment(request.experiment)
    .filter((issue) => issue.severity === 'error');
  if (validationErrors.length > 0) {
    throw new Error(`Combat Lab experiment is invalid: ${validationErrors.map((issue) => `${issue.path}: ${issue.messageRu}`).join('; ')}`);
  }

  const sourceDigest = digestCombatLabExperiment(request.experiment);
  const experiment = prepareCombatLabExperimentForRun(request.experiment, request.seed);
  const state = createEmptySimulationState();
  restoreSimulationStateFromSceneSnapshot(state, experiment.sceneSnapshot);
  const startedSeconds = state.simulationTimeSeconds;
  const executor = CombatLabScenarioExecutor.create(experiment, state);
  const metricCollector = createCombatLabMetricCollector(state);
  let commandDigest = digestStableValue({ schemaVersion: 1, seed: request.seed, commandResults: [] });
  const maximumSeconds = Math.min(
    request.maximumSimulationSeconds,
    experiment.stopCondition.maximumSimulationSeconds,
  );
  const maximumSteps = Math.ceil(maximumSeconds / COMBAT_LAB_FIXED_STEP_SECONDS) + 2;
  let guardExhausted = true;

  observeCombatLabMetrics(state, metricCollector);
  for (let stepIndex = 0; stepIndex < maximumSteps; stepIndex += 1) {
    const beforeSnapshot = executor.getSnapshot();
    if (isTerminal(beforeSnapshot.status)) {
      guardExhausted = false;
      break;
    }
    const elapsedSeconds = state.simulationTimeSeconds - startedSeconds;
    if (elapsedSeconds + COMBAT_LAB_FIXED_STEP_SECONDS > maximumSeconds + EPSILON_SECONDS) {
      executor.stop('combat_lab_batch_maximum_time', 'Достигнуто максимальное время headless-прогона.');
      guardExhausted = false;
      break;
    }

    const commandResults = beforeSimulationStepIgnoringBreakpoints(executor, experiment);
    if (commandResults.length > 0) {
      commandDigest = digestStableValue({ previous: commandDigest, commandResults });
    }
    if (isTerminal(executor.getSnapshot().status)) {
      guardExhausted = false;
      break;
    }
    tickSimulation(state, COMBAT_LAB_FIXED_STEP_SECONDS);
    executor.afterSimulationStep();
    observeCombatLabMetrics(state, metricCollector);
  }

  let runtime = executor.getSnapshot();
  if (isTerminal(runtime.status)) guardExhausted = false;
  if (guardExhausted) {
    executor.stop('combat_lab_runner_guard_exhausted', 'Защитный предел шагов headless-прогона исчерпан.');
    runtime = executor.getSnapshot();
  }
  const metrics = finalizeCombatLabMetrics(state, metricCollector);
  metrics.simulatedSeconds = runtime.simulatedSeconds;
  const stopReason = runtime.stopReasonCode ?? 'combat_lab_runner_stopped_without_reason';
  return Object.freeze({
    schemaVersion: 1,
    experimentId: experiment.experimentId,
    experimentRevision: experiment.revision,
    sourceDigest,
    seed: request.seed,
    completed: !guardExhausted,
    success: runtime.success === true,
    stopReason,
    simulatedSeconds: runtime.simulatedSeconds,
    metrics: Object.freeze(metrics),
    eventDigest: digestStableValue({
      seed: request.seed,
      productionEvents: digestCombatLabEvents(state),
      commandDigest,
    }),
    finalStateDigest: digestStableValue({
      seed: request.seed,
      physicalState: digestCombatLabState(state),
    }),
    stepFailureCode: runtime.steps.find((step) => step.state === 'failed')?.reasonCode ?? null,
  });
}


function beforeSimulationStepIgnoringBreakpoints(
  executor: CombatLabScenarioExecutor,
  experiment: CombatLabExperimentV1,
): readonly CombatLabCommandResultV1[] {
  const results = [...executor.beforeSimulationStep()];
  const maximumResumes = experiment.tracks.reduce((sum, track) => sum + track.steps.length, 0) + 1;
  for (let resumeIndex = 0; resumeIndex < maximumResumes; resumeIndex += 1) {
    if (!executor.getSnapshot().steps.some((step) => step.state === 'paused_at_breakpoint')) return results;
    results.push(...executor.beforeSimulationStep());
  }
  throw new Error('Combat Lab headless breakpoint auto-resume guard exhausted.');
}

function createEmptySimulationState(): SimulationState {
  return createInitialState({
    width: 1,
    height: 1,
    cellSize: 1,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, []);
}

function validateRunRequest(request: CombatLabExperimentRunRequestV1): void {
  if (request.schemaVersion !== 1) throw new Error(`Unsupported Combat Lab experiment run schema: ${request.schemaVersion}.`);
  if (!Number.isInteger(request.seed) || request.seed < 1 || request.seed > MAX_UINT32) {
    throw new Error('Combat Lab experiment seed must be an integer in 1..4294967295.');
  }
  if (!Number.isFinite(request.maximumSimulationSeconds) || request.maximumSimulationSeconds < 0.1 || request.maximumSimulationSeconds > 600) {
    throw new Error('Combat Lab maximumSimulationSeconds must be in 0.1..600.');
  }
}

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'stopped';
}
