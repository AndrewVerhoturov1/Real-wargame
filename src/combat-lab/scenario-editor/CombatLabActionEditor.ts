import type { CombatLabActionV1, CombatLabExperimentV1 } from '../../core/testing/combat-lab/experiment';

export class CombatLabActionEditor {
  static describe(action: CombatLabActionV1, experiment: CombatLabExperimentV1): string {
    switch (action.kind) {
      case 'fire': return `${roleTitle(experiment, action.actorRoleId)} стреляет: ${targetTitle(experiment, action.target)}`;
      case 'move': return `${roleTitle(experiment, action.actorRoleId)} движется к ${markerTitle(experiment, action.markerId)}`;
      case 'face': return `${roleTitle(experiment, action.actorRoleId)} поворачивается к ${markerTitle(experiment, action.markerId)}`;
      case 'posture': return `${roleTitle(experiment, action.actorRoleId)} меняет позу`;
      case 'wait': return action.durationSeconds === null ? 'Ждать выполнения условия' : `Ждать ${action.durationSeconds} с`;
      case 'reload': return `${roleTitle(experiment, action.actorRoleId)} перезаряжает оружие`;
      case 'deploy': return `${roleTitle(experiment, action.actorRoleId)} устанавливает оружие`;
      case 'undeploy': return `${roleTitle(experiment, action.actorRoleId)} снимает оружие`;
      case 'transfer': return `${roleTitle(experiment, action.sourceRoleId)} передаёт патроны ${roleTitle(experiment, action.targetRoleId)}`;
      case 'first_aid': return `${roleTitle(experiment, action.actorRoleId)} оказывает помощь ${roleTitle(experiment, action.targetRoleId)}`;
      case 'cancel_action': return `${roleTitle(experiment, action.actorRoleId)} отменяет текущее действие`;
      case 'stop_fire': return `${roleTitle(experiment, action.actorRoleId)} прекращает огонь`;
    }
  }

  static validate(action: CombatLabActionV1, experiment: CombatLabExperimentV1): string | null {
    const roleIds = actionRoleIds(action);
    if (roleIds.some((roleId) => !experiment.roles.some((role) => role.roleId === roleId))) {
      return 'Один из выбранных бойцов больше не существует.';
    }
    const markerIds = actionMarkerIds(action);
    if (markerIds.some((markerId) => !experiment.markers.some((marker) => marker.markerId === markerId))) {
      return 'Одна из выбранных меток больше не существует.';
    }
    if (action.kind === 'wait' && action.durationSeconds !== null && (!Number.isFinite(action.durationSeconds) || action.durationSeconds < 0)) {
      return 'Время ожидания должно быть неотрицательным.';
    }
    if (action.kind === 'transfer' && (!Number.isFinite(action.requestedRounds) || action.requestedRounds < 1)) {
      return 'Количество патронов должно быть не меньше одного.';
    }
    return null;
  }
}

function actionRoleIds(action: CombatLabActionV1): string[] {
  switch (action.kind) {
    case 'fire': return [action.actorRoleId, ...(action.target.kind === 'role' ? [action.target.roleId] : [])];
    case 'move':
    case 'face':
    case 'posture':
    case 'cancel_action':
    case 'stop_fire': return [action.actorRoleId];
    case 'reload':
    case 'deploy':
    case 'undeploy': return [action.actorRoleId, ...(action.helperRoleId ? [action.helperRoleId] : [])];
    case 'transfer': return [action.sourceRoleId, action.targetRoleId];
    case 'first_aid': return [action.actorRoleId, action.targetRoleId];
    case 'wait': return [];
  }
}
function actionMarkerIds(action: CombatLabActionV1): string[] {
  if (action.kind === 'move') return [action.markerId, ...(action.finalFacingMarkerId ? [action.finalFacingMarkerId] : [])];
  if (action.kind === 'face') return [action.markerId];
  if (action.kind === 'fire' && action.target.kind === 'marker') return [action.target.markerId];
  return [];
}
function roleTitle(experiment: CombatLabExperimentV1, roleId: string): string { return experiment.roles.find((role) => role.roleId === roleId)?.titleRu ?? 'Неизвестный боец'; }
function markerTitle(experiment: CombatLabExperimentV1, markerId: string): string { return experiment.markers.find((marker) => marker.markerId === markerId)?.titleRu ?? 'Неизвестная метка'; }
function targetTitle(experiment: CombatLabExperimentV1, target: Extract<CombatLabActionV1, { kind: 'fire' }>['target']): string { return target.kind === 'role' ? roleTitle(experiment, target.roleId) : markerTitle(experiment, target.markerId); }
