import type { CombatLabConditionV1, CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';

export class CombatLabConditionEditor {
  static describe(condition: CombatLabConditionV1, experiment: CombatLabExperimentV1): string {
    switch (condition.kind) {
      case 'always': return 'Начать сразу';
      case 'elapsed': return `После ${formatNumber(condition.seconds)} с`;
      case 'step_state': {
        const track = experiment.tracks.find((candidate) => candidate.trackId === condition.trackId);
        const step = track?.steps.find((candidate) => candidate.stepId === condition.stepId);
        const state = condition.state === 'started' ? 'начат' : condition.state === 'completed' ? 'завершён' : 'завершился ошибкой';
        return `${step?.titleRu ?? 'Другой шаг'}: ${state}`;
      }
      case 'role_state': return `${roleTitle(experiment, condition.roleId)}: ${roleStateRu(condition.state)}`;
      case 'contact': return `${roleTitle(experiment, condition.observerRoleId)} ${condition.present ? 'видит' : 'не видит'} ${roleTitle(experiment, condition.targetRoleId)}`;
      case 'ammo': return condition.comparison === 'empty'
        ? `${roleTitle(experiment, condition.roleId)}: патроны закончились`
        : `${roleTitle(experiment, condition.roleId)}: патронов ${condition.comparison === 'at_most' ? 'не больше' : 'не меньше'} ${condition.rounds}`;
      case 'suppression': return `${roleTitle(experiment, condition.roleId)}: подавление ${condition.comparison === 'at_most' ? 'не выше' : 'не ниже'} ${formatNumber(condition.value)}`;
    }
  }

  static validate(condition: CombatLabConditionV1, experiment: CombatLabExperimentV1): string | null {
    switch (condition.kind) {
      case 'step_state': {
        const track = experiment.tracks.find((candidate) => candidate.trackId === condition.trackId);
        if (!track) return 'Выбранная дорожка условия больше не существует.';
        if (!track.steps.some((step) => step.stepId === condition.stepId)) return 'Выбранный шаг условия больше не существует.';
        return null;
      }
      case 'role_state':
      case 'ammo':
      case 'suppression': return hasRole(experiment, condition.roleId) ? null : 'Выбранный боец условия больше не существует.';
      case 'contact': return hasRole(experiment, condition.observerRoleId) && hasRole(experiment, condition.targetRoleId)
        ? null : 'Один из бойцов условия контакта больше не существует.';
      case 'elapsed': return Number.isFinite(condition.seconds) && condition.seconds >= 0 ? null : 'Время условия должно быть неотрицательным.';
      case 'always': return null;
    }
  }
}

function hasRole(experiment: CombatLabExperimentV1, roleId: string): boolean {
  return experiment.roles.some((role) => role.roleId === roleId);
}
function roleTitle(experiment: CombatLabExperimentV1, roleId: string): string {
  return experiment.roles.find((role) => role.roleId === roleId)?.titleRu ?? 'Неизвестный боец';
}
function roleStateRu(state: string): string {
  const labels: Record<string, string> = {
    capable: 'боеспособен', incapacitated: 'небоеспособен', can_fire: 'может стрелять', cannot_fire: 'не может стрелять', can_move: 'может двигаться', cannot_move: 'не может двигаться',
  };
  return labels[state] ?? state;
}
function formatNumber(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''); }
