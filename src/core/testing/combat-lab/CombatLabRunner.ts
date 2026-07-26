import { tickSimulation } from '../../simulation/SimulationTick';
import type { SimulationState } from '../../simulation/SimulationState';
import { executeCombatLabCommand } from './CombatLabCommands';
import {
  COMBAT_LAB_FIXED_STEP_SECONDS,
  type CombatLabCommandResultV1,
  type CombatLabProgramRuntimeV1,
  type CombatLabRunRequestV1,
  type CombatLabRunResultV1,
  type CombatLabScenarioDefinitionV1,
} from './CombatLabContracts';
import { digestCombatLabEvents, digestCombatLabState, digestStableValue } from './CombatLabDigest';
import {
  createCombatLabMetricCollector,
  finalizeCombatLabMetrics,
  observeCombatLabMetrics,
} from './CombatLabMetrics';
import { buildCombatLabInitialState } from './CombatLabScenarioRegistry';

const EPSILON_SECONDS = 1e-9;
const MAX_RUNNER_STEPS = 1_000_000;

export function runCombatLabScenario(request: CombatLabRunRequestV1): CombatLabRunResultV1 {
  return runCombatLabScenarioWithFixedStep(request, COMBAT_LAB_FIXED_STEP_SECONDS);
}

export function runCombatLabScenarioWithFixedStep(
  request: CombatLabRunRequestV1,
  fixedStepSeconds: number,
): CombatLabRunResultV1 {
  validateRunRequest(request, fixedStepSeconds);
  const built = buildCombatLabInitialState(request.scenarioId, request.scenarioRevision, request.seed);
  const state = built.state;
  const definition = built.definition;
  const program: CombatLabProgramRuntimeV1 = {
    appliedStepIds: new Set<string>(),
    nextStepIndex: 0,
    lastCommandResult: null,
  };
  const commandResults: Array<{ stepId: string; result: CombatLabCommandResultV1 }> = [];
  const metrics = createCombatLabMetricCollector(state);
  const maximumSeconds = Math.min(
    request.maximumSimulationSeconds,
    request.stopCondition.maximumSimulationSeconds,
  );
  let stopReason = 'maximum_simulation_seconds';
  let completed = false;

  for (let guard = 0; guard < MAX_RUNNER_STEPS; guard += 1) {
    applyDueProgramSteps(state, definition, program, commandResults);
    observeCombatLabMetrics(state, metrics);

    if (shouldStopForProgram(request, state, definition, program)) {
      stopReason = 'program_complete';
      completed = true;
      break;
    }
    if (state.simulationTimeSeconds + EPSILON_SECONDS >= maximumSeconds) {
      completed = true;
      break;
    }

    const deltaSeconds = Math.min(fixedStepSeconds, maximumSeconds - state.simulationTimeSeconds);
    if (deltaSeconds <= EPSILON_SECONDS) {
      completed = true;
      break;
    }
    tickSimulation(state, deltaSeconds);
  }

  if (!completed) stopReason = 'runner_guard_exhausted';
  const stateDigest = digestCombatLabState(state);
  return {
    schemaVersion: 1,
    scenarioId: definition.scenarioId,
    scenarioRevision: definition.revision,
    seed: request.seed,
    completed,
    stopReason,
    simulatedSeconds: canonicalSeconds(state.simulationTimeSeconds),
    metrics: finalizeCombatLabMetrics(state, metrics),
    eventDigest: digestStableValue({
      productionEvents: digestCombatLabEvents(state),
      commandResults,
    }),
    finalStateDigest: digestStableValue({ seed: request.seed, physicalState: stateDigest }),
  };
}

export function applyDueCombatLabProgramSteps(
  state: SimulationState,
  definition: CombatLabScenarioDefinitionV1,
  runtime: CombatLabProgramRuntimeV1,
  ownerId = `program:${definition.scenarioId}@${definition.revision}`,
): readonly CombatLabCommandResultV1[] {
  const applied: CombatLabCommandResultV1[] = [];
  while (runtime.nextStepIndex < definition.defaultProgram.length) {
    const step = definition.defaultProgram[runtime.nextStepIndex]!;
    if (step.atSimulationSeconds > state.simulationTimeSeconds + EPSILON_SECONDS) break;
    runtime.nextStepIndex += 1;
    if (runtime.appliedStepIds.has(step.stepId)) continue;
    const result = executeCombatLabCommand(state, step.command, {
      ownerId,
      commandSequence: runtime.nextStepIndex,
      interactive: false,
    });
    runtime.appliedStepIds.add(step.stepId);
    runtime.lastCommandResult = result;
    applied.push(result);
  }
  return applied;
}

function applyDueProgramSteps(
  state: SimulationState,
  definition: CombatLabScenarioDefinitionV1,
  runtime: CombatLabProgramRuntimeV1,
  commandResults: Array<{ stepId: string; result: CombatLabCommandResultV1 }>,
): void {
  const previousIndex = runtime.nextStepIndex;
  const results = applyDueCombatLabProgramSteps(state, definition, runtime);
  for (let index = 0; index < results.length; index += 1) {
    const step = definition.defaultProgram[previousIndex + index];
    commandResults.push({ stepId: step?.stepId ?? `step-${previousIndex + index}`, result: results[index]! });
  }
}

function shouldStopForProgram(
  request: CombatLabRunRequestV1,
  state: SimulationState,
  definition: CombatLabScenarioDefinitionV1,
  runtime: CombatLabProgramRuntimeV1,
): boolean {
  if (request.stopCondition.kind !== 'program_complete') return false;
  if (runtime.appliedStepIds.size < definition.defaultProgram.length) return false;
  return isCombatLabStateQuiescent(state);
}

export function isCombatLabStateQuiescent(state: SimulationState): boolean {
  if (state.infantryCombatProjectiles.activeProjectiles.length > 0) return false;
  return state.units.every((unit) => {
    const runtime = unit.infantryCombatRuntime;
    return !unit.order
      && !unit.behaviorRuntime.physicalAction
      && !runtime.activeFireTask
      && !runtime.primaryWeapon?.deployment.activeAction
      && !runtime.ammoInventory.activeReload
      && !runtime.ammoInventory.activeTransfer
      && !runtime.medical.activeFirstAidAction;
  });
}

function validateRunRequest(request: CombatLabRunRequestV1, fixedStepSeconds: number): void {
  if (request.schemaVersion !== 1) throw new Error(`Unsupported Combat Lab run request schema: ${request.schemaVersion}.`);
  if (!Number.isFinite(request.seed)) throw new Error('Combat Lab seed must be finite.');
  if (!Number.isFinite(request.maximumSimulationSeconds) || request.maximumSimulationSeconds <= 0) {
    throw new Error('Combat Lab maximumSimulationSeconds must be positive.');
  }
  if (!Number.isFinite(request.stopCondition.maximumSimulationSeconds) || request.stopCondition.maximumSimulationSeconds <= 0) {
    throw new Error('Combat Lab stop condition maximum must be positive.');
  }
  if (!Number.isFinite(fixedStepSeconds) || fixedStepSeconds <= 0 || fixedStepSeconds > 0.25) {
    throw new Error('Combat Lab fixed step must be in (0, 0.25].');
  }
}

function canonicalSeconds(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000_000) / 1_000_000_000;
}
