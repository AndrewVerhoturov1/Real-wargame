import type {
  CombatLabExperimentV1,
  CombatLabScenarioStepV1,
} from '../../core/testing/combat-lab/experiment';
import {
  combatLabActionLabelRu,
  combatLabActionTargetLabelRu,
  combatLabConditionLabelRu,
} from './CombatLabEditorFactories';

export interface CombatLabActionSummaryV1 {
  readonly titleRu: string;
  readonly targetRu: string;
  readonly scheduleRu: string;
}

export function buildCombatLabActionSummary(
  experiment: CombatLabExperimentV1,
  step: CombatLabScenarioStepV1,
): CombatLabActionSummaryV1 {
  return Object.freeze({
    titleRu: combatLabActionLabelRu(step.action),
    targetRu: combatLabActionTargetLabelRu(experiment, step.action),
    scheduleRu: step.startCondition.kind === 'always'
      ? 'Сразу'
      : `Начать: ${combatLabConditionLabelRu(step.startCondition)}`,
  });
}
