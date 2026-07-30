import type { SimulationState } from '../../../simulation/SimulationState';
import type { CombatLabCommandResultV1 } from '../CombatLabContracts';
import type {
  CombatLabExperimentV1,
  CombatLabScenarioRuntimeSnapshotV1,
} from './CombatLabExperimentContracts';
import { resolveCombatLabParticipantAccuracy } from './CombatLabParticipantParameters';
import { CombatLabScenarioExecutor as Stage10ScenarioExecutor } from './CombatLabScenarioExecutor';

/**
 * Participant-aware facade over the Stage 10 executor. It only resolves the
 * effective laboratory accuracy snapshot; all production actions and lifecycle
 * remain owned by the existing executor.
 */
export class CombatLabParticipantScenarioExecutor {
  private constructor(private readonly delegate: Stage10ScenarioExecutor) {}

  static create(
    experiment: CombatLabExperimentV1,
    state: SimulationState,
  ): CombatLabParticipantScenarioExecutor {
    return new CombatLabParticipantScenarioExecutor(
      Stage10ScenarioExecutor.create(resolveParticipantStepParameters(experiment), state),
    );
  }

  beforeSimulationStep(): readonly CombatLabCommandResultV1[] {
    return this.delegate.beforeSimulationStep();
  }

  afterSimulationStep(): void {
    this.delegate.afterSimulationStep();
  }

  getSnapshot(): CombatLabScenarioRuntimeSnapshotV1 {
    return this.delegate.getSnapshot();
  }

  stop(reasonCode: string, reasonRu: string): void {
    this.delegate.stop(reasonCode, reasonRu);
  }
}

export function resolveParticipantStepParameters(
  experiment: CombatLabExperimentV1,
): CombatLabExperimentV1 {
  return Object.freeze({
    ...experiment,
    tracks: Object.freeze(experiment.tracks.map((track) => Object.freeze({
      ...track,
      steps: Object.freeze(track.steps.map((step) => {
        if (step.action.kind !== 'fire') return step;
        const resolved = resolveCombatLabParticipantAccuracy(experiment, step.action.actorRoleId, step);
        return Object.freeze({ ...step, accuracyOverrides: resolved.accuracyOverrides });
      })),
    }))),
  });
}
