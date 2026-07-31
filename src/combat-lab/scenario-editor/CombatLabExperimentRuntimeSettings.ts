import {
  COMBAT_LAB_EXPERIMENT_LIMITS_V1,
  type CombatLabExperimentV1,
} from '../../core/testing/combat-lab';

export interface CombatLabExperimentRuntimeSettingsV1 {
  readonly maximumSimulationSeconds: number;
}

export function updateCombatLabExperimentRuntimeSettings(
  experiment: CombatLabExperimentV1,
  settings: CombatLabExperimentRuntimeSettingsV1,
): CombatLabExperimentV1 {
  const maximumSimulationSeconds = normalizeMaximumSimulationSeconds(settings.maximumSimulationSeconds);
  if (
    experiment.stopCondition.maximumSimulationSeconds === maximumSimulationSeconds
    && experiment.batchDefaults.maximumSimulationSeconds === maximumSimulationSeconds
  ) return experiment;

  return {
    ...experiment,
    revision: experiment.revision + 1,
    stopCondition: {
      ...experiment.stopCondition,
      maximumSimulationSeconds,
    },
    batchDefaults: {
      ...experiment.batchDefaults,
      maximumSimulationSeconds,
    },
  };
}

export function normalizeMaximumSimulationSeconds(value: number): number {
  const limits = COMBAT_LAB_EXPERIMENT_LIMITS_V1;
  if (!Number.isFinite(value)) throw new Error('Длительность эксперимента должна быть конечным числом.');
  const normalized = Math.round(value * 10) / 10;
  if (normalized < limits.minimumSimulationSeconds || normalized > limits.maximumSimulationSeconds) {
    throw new Error(`Длительность эксперимента должна быть от ${limits.minimumSimulationSeconds} до ${limits.maximumSimulationSeconds} секунд.`);
  }
  return normalized;
}
