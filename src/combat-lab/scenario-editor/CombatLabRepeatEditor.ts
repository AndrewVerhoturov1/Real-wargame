import type { CombatLabExperimentV1, CombatLabRepeatPolicyV1 } from '../../core/testing/combat-lab/experiment';
import { CombatLabConditionEditor } from './CombatLabConditionEditor';

export class CombatLabRepeatEditor {
  static describe(repeat: CombatLabRepeatPolicyV1): string {
    return repeat.kind === 'once'
      ? 'Выполнить один раз'
      : `Повторять до условия, не больше ${repeat.maximumAttempts} попыток`;
  }

  static validate(repeat: CombatLabRepeatPolicyV1, experiment: CombatLabExperimentV1): string | null {
    if (repeat.kind === 'once') return null;
    if (!Number.isInteger(repeat.maximumAttempts) || repeat.maximumAttempts < 1 || repeat.maximumAttempts > 1000) {
      return 'Число попыток должно быть от 1 до 1000.';
    }
    if (!Number.isFinite(repeat.retryDelaySeconds) || repeat.retryDelaySeconds < 0) {
      return 'Задержка между попытками должна быть неотрицательной.';
    }
    return CombatLabConditionEditor.validate(repeat.condition, experiment);
  }
}
