import type {
  CombatLabActionV1,
  CombatLabConditionV1,
  CombatLabExperimentV1,
  CombatLabFailurePolicyV1,
  CombatLabFireModeV1,
  CombatLabMarkerV1,
  CombatLabScenarioStepV1,
  CombatLabStepRuntimeState,
} from '../../core/testing/combat-lab/experiment';

export type CombatLabEditorActionKind = CombatLabActionV1['kind'];

export interface CombatLabStepFactoryOptions {
  readonly targetRoleId?: string | null;
  readonly markerId?: string | null;
  readonly helperRoleId?: string | null;
  readonly fireMode?: CombatLabFireModeV1;
  readonly titleRu?: string;
}

export function createCombatLabScenarioStep(
  experiment: CombatLabExperimentV1,
  actorRoleId: string,
  actionKind: CombatLabEditorActionKind,
  options: CombatLabStepFactoryOptions = {},
): CombatLabScenarioStepV1 {
  const action = createAction(experiment, actorRoleId, actionKind, options);
  const stepId = nextStepId(experiment);
  const durationSeconds = action.kind === 'wait' ? action.durationSeconds : null;
  return {
    stepId,
    titleRu: options.titleRu ?? combatLabActionLabelRu(action),
    enabled: true,
    breakpointBefore: false,
    startCondition: { kind: 'always' },
    action,
    completion: action.kind === 'fire'
      ? { kind: 'shot_resolved' }
      : action.kind === 'wait' && durationSeconds !== null
        ? { kind: 'condition', condition: { kind: 'elapsed', anchor: 'step_start', seconds: durationSeconds } }
        : { kind: 'production_action' },
    repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 },
    timeoutSeconds: experiment.defaults.stepTimeoutSeconds,
    failurePolicy: experiment.defaults.failurePolicy,
    accuracyOverrides: action.kind === 'fire' ? experiment.defaults.accuracyOverrides : null,
  };
}

export function combatLabActionLabelRu(action: CombatLabActionV1): string {
  switch (action.kind) {
    case 'fire': return fireModeLabelRu(action.mode);
    case 'stop_fire': return 'Прекратить огонь';
    case 'move': return 'Двигаться к метке';
    case 'posture': return action.targetPosture === 'standing'
      ? 'Встать'
      : action.targetPosture === 'crouched' ? 'Пригнуться' : 'Лечь';
    case 'wait': return action.durationSeconds === null ? 'Ждать условия' : `Ждать ${formatSeconds(action.durationSeconds)}`;
    case 'reload': return 'Перезарядить';
    case 'deploy': return 'Установить оружие';
    case 'undeploy': return 'Снять оружие';
    case 'transfer': return `Передать ${action.requestedRounds} патронов`;
    case 'first_aid': return 'Оказать первую помощь';
  }
}

export function combatLabActionTargetLabelRu(
  experiment: CombatLabExperimentV1,
  action: CombatLabActionV1,
): string {
  switch (action.kind) {
    case 'fire': return action.target.kind === 'role'
      ? roleLabel(experiment, action.target.roleId)
      : markerLabel(experiment, action.target.markerId);
    case 'move': return markerLabel(experiment, action.markerId);
    case 'transfer': return roleLabel(experiment, action.targetRoleId);
    case 'first_aid': return roleLabel(experiment, action.targetRoleId);
    case 'reload':
    case 'deploy':
    case 'undeploy': return action.helperRoleId ? `помощник: ${roleLabel(experiment, action.helperRoleId)}` : 'без помощника';
    case 'posture': return action.targetPosture;
    case 'wait': return action.durationSeconds === null ? 'условие завершения' : formatSeconds(action.durationSeconds);
    case 'stop_fire': return roleLabel(experiment, action.actorRoleId);
  }
}

export function combatLabRuntimeStateLabelRu(state: CombatLabStepRuntimeState | null): string {
  switch (state) {
    case 'pending': return 'ожидает';
    case 'waiting': return 'ждёт условие';
    case 'running': return 'выполняется';
    case 'completed': return 'завершено';
    case 'failed': return 'ошибка';
    case 'skipped': return 'пропущено';
    case 'paused_at_breakpoint': return 'точка остановки';
    default: return 'не запущено';
  }
}

export function combatLabConditionLabelRu(condition: CombatLabConditionV1): string {
  switch (condition.kind) {
    case 'always': return 'сразу';
    case 'elapsed': return `через ${formatSeconds(condition.seconds)}`;
    case 'step_state': return `${condition.trackId}/${condition.stepId}: ${condition.state}`;
    case 'role_state': return `${condition.roleId}: ${condition.state}`;
    case 'contact': return `${condition.observerRoleId} ${condition.present ? 'видит' : 'не видит'} ${condition.targetRoleId}`;
    case 'ammo': return condition.comparison === 'empty'
      ? `${condition.roleId}: патроны закончились`
      : `${condition.roleId}: патроны ${condition.comparison} ${condition.rounds}`;
    case 'suppression': return `${condition.roleId}: подавление ${condition.comparison} ${condition.value}`;
  }
}

export function defaultFailurePolicy(): CombatLabFailurePolicyV1 {
  return 'stop_experiment';
}

export function nextMarkerId(experiment: CombatLabExperimentV1, prefix = 'marker'): string {
  return nextId(prefix, experiment.markers.map((marker) => marker.markerId));
}

export function markerAt(
  experiment: CombatLabExperimentV1,
  kind: CombatLabMarkerV1['kind'],
  titleRu: string,
  xMetres: number,
  yMetres: number,
  radiusMetres = 5,
): CombatLabMarkerV1 {
  const markerId = nextMarkerId(experiment, kind === 'circle' ? 'area' : 'point');
  return kind === 'circle'
    ? { markerId, kind, titleRu, xMetres, yMetres, zMetres: 0, radiusMetres }
    : { markerId, kind, titleRu, xMetres, yMetres, zMetres: 0 };
}

function createAction(
  experiment: CombatLabExperimentV1,
  actorRoleId: string,
  actionKind: CombatLabEditorActionKind,
  options: CombatLabStepFactoryOptions,
): CombatLabActionV1 {
  const targetRoleId = options.targetRoleId ?? experiment.roles.find((role) => role.roleId !== actorRoleId)?.roleId ?? actorRoleId;
  const markerId = options.markerId === undefined ? experiment.markers[0]?.markerId ?? null : options.markerId;
  switch (actionKind) {
    case 'fire': return {
      kind: 'fire',
      actorRoleId,
      target: markerId
        ? { kind: 'marker', markerId }
        : { kind: 'role', roleId: targetRoleId },
      mode: options.fireMode ?? 'single',
      targetRadiusMetres: options.fireMode === 'suppress' ? 5 : 0.5,
      minimumSolutionQuality: 0.5,
      minimumPerceptionQuality: 0.5,
      forceFire: false,
    };
    case 'stop_fire': return { kind: 'stop_fire', actorRoleId };
    case 'move': {
      if (!markerId) throw new Error('Сначала создайте метку движения.');
      return { kind: 'move', actorRoleId, markerId };
    }
    case 'posture': return { kind: 'posture', actorRoleId, targetPosture: 'prone' };
    case 'wait': return { kind: 'wait', durationSeconds: 1 };
    case 'reload': return { kind: 'reload', actorRoleId, helperRoleId: options.helperRoleId ?? null };
    case 'deploy': return { kind: 'deploy', actorRoleId, helperRoleId: options.helperRoleId ?? null };
    case 'undeploy': return { kind: 'undeploy', actorRoleId, helperRoleId: options.helperRoleId ?? null };
    case 'transfer': return { kind: 'transfer', sourceRoleId: actorRoleId, targetRoleId, requestedRounds: 30 };
    case 'first_aid': return { kind: 'first_aid', actorRoleId, targetRoleId, zone: null };
  }
}

function nextStepId(experiment: CombatLabExperimentV1): string {
  return nextId('step', experiment.tracks.flatMap((track) => track.steps.map((step) => step.stepId)));
}

function nextId(prefix: string, ids: readonly string[]): string {
  const used = new Set(ids);
  for (let index = 1; index <= 1_000_000; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Не удалось создать ID ${prefix}.`);
}

function roleLabel(experiment: CombatLabExperimentV1, roleId: string): string {
  const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
  return role ? `${role.titleRu} · ${role.roleId}` : roleId;
}

function markerLabel(experiment: CombatLabExperimentV1, markerId: string): string {
  const marker = experiment.markers.find((candidate) => candidate.markerId === markerId);
  return marker ? `${marker.titleRu} · ${marker.markerId}` : markerId;
}

function fireModeLabelRu(mode: CombatLabFireModeV1): string {
  switch (mode) {
    case 'single': return 'Одиночный выстрел';
    case 'short_burst': return 'Короткая очередь';
    case 'long_burst': return 'Длинная очередь';
    case 'suppress': return 'Подавляющий огонь';
  }
}

function formatSeconds(value: number): string {
  return `${Number(value.toFixed(3))} с`;
}
