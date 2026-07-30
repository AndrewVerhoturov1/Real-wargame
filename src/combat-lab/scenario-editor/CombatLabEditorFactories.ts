import type {
  CombatLabActionV1,
  CombatLabConditionV1,
  CombatLabExperimentV1,
  CombatLabFailurePolicyV1,
  CombatLabFireModeV1,
  CombatLabMarkerV1,
  CombatLabScenarioStepV1,
  CombatLabStepRuntimeState,
  CombatLabTacticalOrderPresetV1,
} from '../../core/testing/combat-lab/experiment';
import {
  createCombatLabActionFromCatalog,
  findCombatLabActionDescriptorForAction,
} from './CombatLabActionCatalog';

export type CombatLabEditorActionKind = CombatLabActionV1['kind'];

export interface CombatLabStepFactoryOptions {
  readonly actionCatalogId?: string;
  readonly targetRoleId?: string | null;
  readonly markerId?: string | null;
  readonly helperRoleId?: string | null;
  readonly fireMode?: CombatLabFireModeV1;
  readonly tacticalOrderPresetId?: CombatLabTacticalOrderPresetV1;
  readonly finalFacingMarkerId?: string | null;
  readonly waitSeconds?: number;
  readonly titleRu?: string;
}

export function createCombatLabScenarioStep(
  experiment: CombatLabExperimentV1,
  actorRoleId: string,
  actionKind: CombatLabEditorActionKind,
  options: CombatLabStepFactoryOptions = {},
): CombatLabScenarioStepV1 {
  const catalogId = options.actionCatalogId ?? legacyCatalogId(actionKind, options);
  const action = createCombatLabActionFromCatalog(experiment, actorRoleId, catalogId, options);
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

export function createCombatLabScenarioStepFromCatalog(
  experiment: CombatLabExperimentV1,
  actorRoleId: string,
  actionCatalogId: string,
  options: Omit<CombatLabStepFactoryOptions, 'actionCatalogId'> = {},
): CombatLabScenarioStepV1 {
  return createCombatLabScenarioStep(experiment, actorRoleId, 'wait', { ...options, actionCatalogId });
}

export function combatLabActionLabelRu(action: CombatLabActionV1): string {
  if (action.kind === 'transfer') return `Передать ${action.requestedRounds} патронов`;
  if (action.kind === 'wait' && action.durationSeconds !== null) return `Ждать ${formatSeconds(action.durationSeconds)}`;
  return findCombatLabActionDescriptorForAction(action).labelRu;
}

export function combatLabActionTargetLabelRu(experiment: CombatLabExperimentV1, action: CombatLabActionV1): string {
  switch (action.kind) {
    case 'fire': return action.target.kind === 'role' ? roleLabel(experiment, action.target.roleId) : markerLabel(experiment, action.target.markerId);
    case 'move': {
      const destination = markerLabel(experiment, action.markerId);
      return action.finalFacingMarkerId ? `${destination}; смотреть: ${markerLabel(experiment, action.finalFacingMarkerId)}` : destination;
    }
    case 'face': return markerLabel(experiment, action.markerId);
    case 'cancel_action': return cancelTargetLabel(action.target);
    case 'transfer': return roleLabel(experiment, action.targetRoleId);
    case 'first_aid': return roleLabel(experiment, action.targetRoleId);
    case 'reload':
    case 'deploy':
    case 'undeploy': return action.helperRoleId ? `помощник: ${roleLabel(experiment, action.helperRoleId)}` : 'без помощника';
    case 'posture': return action.targetPosture === 'standing' ? 'стоя' : action.targetPosture === 'crouched' ? 'пригнувшись' : 'лёжа';
    case 'wait': return action.durationSeconds === null ? 'до выполнения условия' : formatSeconds(action.durationSeconds);
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
    case 'step_state': return `после действия ${condition.stepId}: ${condition.state}`;
    case 'role_state': return `${condition.roleId}: ${condition.state}`;
    case 'contact': return `${condition.observerRoleId} ${condition.present ? 'видит' : 'не видит'} ${condition.targetRoleId}`;
    case 'ammo': return condition.comparison === 'empty' ? `${condition.roleId}: патроны закончились` : `${condition.roleId}: патроны ${condition.comparison} ${condition.rounds}`;
    case 'suppression': return `${condition.roleId}: подавление ${condition.comparison} ${condition.value}`;
  }
}

export function defaultFailurePolicy(): CombatLabFailurePolicyV1 { return 'stop_experiment'; }
export function nextMarkerId(experiment: CombatLabExperimentV1, prefix = 'marker'): string { return nextId(prefix, experiment.markers.map((marker) => marker.markerId)); }

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

function legacyCatalogId(actionKind: CombatLabEditorActionKind, options: CombatLabStepFactoryOptions): string {
  if (actionKind === 'fire') return options.fireMode === 'short_burst' ? 'fire-short' : options.fireMode === 'long_burst' ? 'fire-long' : options.fireMode === 'suppress' ? 'fire-suppress' : 'fire-single';
  if (actionKind === 'move') return options.tacticalOrderPresetId ?? 'move';
  if (actionKind === 'posture') return 'prone';
  if (actionKind === 'stop_fire') return 'cancel-fire';
  if (actionKind === 'cancel_action') return 'cancel-movement';
  if (actionKind === 'first_aid') return 'first-aid';
  if (actionKind === 'wait') return options.waitSeconds === undefined ? 'wait-time' : 'wait-time';
  return actionKind;
}

function nextStepId(experiment: CombatLabExperimentV1): string { return nextId('step', experiment.tracks.flatMap((track) => track.steps.map((step) => step.stepId))); }
function nextId(prefix: string, ids: readonly string[]): string {
  const used = new Set(ids);
  for (let index = 1; index <= 1_000_000; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Не удалось создать идентификатор ${prefix}.`);
}
function roleLabel(experiment: CombatLabExperimentV1, roleId: string): string { return experiment.roles.find((candidate) => candidate.roleId === roleId)?.titleRu ?? roleId; }
function markerLabel(experiment: CombatLabExperimentV1, markerId: string): string { return experiment.markers.find((candidate) => candidate.markerId === markerId)?.titleRu ?? markerId; }
function cancelTargetLabel(target: Extract<CombatLabActionV1, { kind: 'cancel_action' }>['target']): string {
  return target === 'movement' ? 'движение' : target === 'fire' ? 'огонь' : target === 'reload' ? 'перезарядка' : target === 'deployment' ? 'установка оружия' : target === 'transfer' ? 'передача патронов' : 'первая помощь';
}
function formatSeconds(value: number): string { return `${Number(value.toFixed(3))} с`; }
