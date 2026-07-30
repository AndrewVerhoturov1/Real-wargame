import type { SimulationState } from '../../../simulation/SimulationState';
import type { UnitModel } from '../../../units/UnitModel';
import type {
  CombatLabActionV1,
  CombatLabCompletionV1,
  CombatLabExperimentV1,
} from './CombatLabExperimentContracts';
import {
  evaluateCombatLabCondition,
  resolveCombatLabRoleUnit,
  type CombatLabConditionContextV1,
} from './CombatLabScenarioConditions';

export interface CombatLabCompletionObservationV1 {
  readonly startedSeconds: number;
  readonly ownerToken: string | null;
  readonly actorUnitId: string | null;
  readonly sourceUnitId: string | null;
  readonly targetUnitId: string | null;
  readonly actionId: string | null;
  readonly fireTaskId: string | null;
  readonly targetPosture: 'standing' | 'crouched' | 'prone' | null;
  readonly targetFacingRadians: number | null;
}

export type CombatLabCompletionEvaluationV1 =
  | { readonly status: 'pending'; readonly reasonCode: string; readonly reasonRu: string }
  | { readonly status: 'completed'; readonly reasonCode: string; readonly reasonRu: string }
  | { readonly status: 'failed'; readonly reasonCode: string; readonly reasonRu: string };

export function captureCombatLabCompletionObservation(
  experiment: CombatLabExperimentV1,
  state: SimulationState,
  action: CombatLabActionV1,
  ownerToken: string | null,
  startedSeconds: number,
): CombatLabCompletionObservationV1 {
  const actor = actorForAction(experiment, state, action);
  const source = action.kind === 'transfer' ? resolveCombatLabRoleUnit(experiment, state, action.sourceRoleId) : actor;
  const target = targetForAction(experiment, state, action);
  return {
    startedSeconds,
    ownerToken,
    actorUnitId: actor?.id ?? null,
    sourceUnitId: source?.id ?? null,
    targetUnitId: target?.id ?? null,
    actionId: observableActionId(action, source ?? actor, startedSeconds),
    fireTaskId: action.kind === 'fire' ? observableFireTaskId(actor, startedSeconds) : null,
    targetPosture: action.kind === 'posture' ? action.targetPosture : null,
    targetFacingRadians: action.kind === 'face' ? resolveFacingRadians(experiment, state, action, actor) : null,
  };
}

export function evaluateCombatLabCompletion(
  action: CombatLabActionV1,
  completion: CombatLabCompletionV1,
  observation: CombatLabCompletionObservationV1,
  conditionContext: CombatLabConditionContextV1,
): CombatLabCompletionEvaluationV1 {
  if (completion.kind === 'condition') {
    return evaluateCombatLabCondition(completion.condition, conditionContext)
      ? completed('combat_lab_completion_condition_true', 'Условие завершения выполнено.')
      : pending('combat_lab_completion_condition_waiting', 'Ожидание условия завершения.');
  }
  if (action.kind === 'wait') {
    if (action.durationSeconds === null) return pending('combat_lab_wait_condition_required', 'Ожидание продолжается до выполнения условия завершения.');
    return conditionContext.state.simulationTimeSeconds - observation.startedSeconds + 1e-9 >= action.durationSeconds
      ? completed('combat_lab_wait_completed', 'Ожидание завершено.')
      : pending('combat_lab_wait_running', 'Продолжается ожидание заданного времени.');
  }
  if (action.kind === 'move') return movementCompletion(conditionContext.state, observation);
  if (action.kind === 'face') return facingCompletion(conditionContext.state, observation);
  if (action.kind === 'cancel_action') return cancellationCompletion(conditionContext.state, observation, action.target);
  if (action.kind === 'posture') return postureCompletion(conditionContext.state, observation);
  if (action.kind === 'fire') return fireCompletion(conditionContext.state, observation, completion.kind === 'shot_resolved');
  if (action.kind === 'stop_fire') return cancellationCompletion(conditionContext.state, observation, 'fire');
  if (action.kind === 'reload' || action.kind === 'transfer') return ammoActionCompletion(conditionContext.state, observation, action.kind);
  if (action.kind === 'deploy' || action.kind === 'undeploy') return deploymentCompletion(conditionContext.state, observation, action.kind);
  return firstAidCompletion(conditionContext.state, observation);
}

function movementCompletion(state: SimulationState, observation: CombatLabCompletionObservationV1): CombatLabCompletionEvaluationV1 {
  const unit = findUnit(state, observation.actorUnitId);
  if (!unit) return failed('combat_lab_completion_unit_missing', 'Исполнитель движения отсутствует.');
  return !unit.order && !unit.movementRuntime.isMoving
    ? completed('combat_lab_move_completed', 'Производственный приказ движения завершён.')
    : pending('combat_lab_move_running', 'Производственный приказ движения ещё выполняется.');
}

function facingCompletion(state: SimulationState, observation: CombatLabCompletionObservationV1): CombatLabCompletionEvaluationV1 {
  const unit = findUnit(state, observation.actorUnitId);
  if (!unit || observation.targetFacingRadians === null) return failed('combat_lab_face_target_missing', 'Не удалось определить требуемое направление.');
  return angularDistance(unit.facingRadians, observation.targetFacingRadians) <= 1e-6
    ? completed('combat_lab_face_completed', 'Боец повернулся в заданном направлении.')
    : pending('combat_lab_face_waiting', 'Ожидание заданного направления бойца.');
}

function cancellationCompletion(
  state: SimulationState,
  observation: CombatLabCompletionObservationV1,
  target: 'movement' | 'fire' | 'reload' | 'deployment' | 'transfer' | 'first_aid',
): CombatLabCompletionEvaluationV1 {
  const unit = findUnit(state, observation.actorUnitId);
  if (!unit) return failed('combat_lab_completion_unit_missing', 'Исполнитель отмены отсутствует.');
  const active = target === 'movement'
    ? Boolean(unit.order || unit.movementRuntime.isMoving)
    : target === 'fire'
      ? unit.infantryCombatRuntime.activeFireTask !== null
      : target === 'reload'
        ? unit.infantryCombatRuntime.ammoInventory.activeReload !== null
        : target === 'deployment'
          ? unit.infantryCombatRuntime.primaryWeapon?.deployment.activeAction !== null
          : target === 'transfer'
            ? unit.infantryCombatRuntime.ammoInventory.activeTransfer !== null
            : unit.infantryCombatRuntime.medical.activeFirstAidAction !== null;
  return active
    ? pending('combat_lab_cancel_action_waiting', 'Ожидание завершения отмены действия.')
    : completed('combat_lab_cancel_action_completed', 'Действие отменено производственной системой.');
}

function postureCompletion(state: SimulationState, observation: CombatLabCompletionObservationV1): CombatLabCompletionEvaluationV1 {
  const unit = findUnit(state, observation.actorUnitId);
  if (!unit || !observation.targetPosture) return failed('combat_lab_completion_unit_missing', 'Исполнитель смены позы отсутствует.');
  const action = unit.behaviorRuntime.physicalAction;
  if (action?.type === 'posture_transition' && action.status === 'running') return pending('combat_lab_posture_running', 'Физическая смена позы ещё выполняется.');
  if (unit.behaviorRuntime.posture === observation.targetPosture) return completed('combat_lab_posture_completed', 'Физическая смена позы завершена.');
  if (action && action.status !== 'completed') return failed(action.resultCode ?? 'combat_lab_posture_failed', action.resultRu ?? 'Смена позы завершилась неуспешно.');
  return pending('combat_lab_posture_waiting', 'Ожидание фактической требуемой позы.');
}

function fireCompletion(state: SimulationState, observation: CombatLabCompletionObservationV1, requireResolvedShots: boolean): CombatLabCompletionEvaluationV1 {
  const unit = findUnit(state, observation.actorUnitId);
  if (!unit) return failed('combat_lab_completion_unit_missing', 'Стрелок отсутствует.');
  const taskId = observation.fireTaskId;
  if (!taskId) return failed('combat_lab_fire_task_identity_missing', 'Не удалось зафиксировать идентификатор огневой задачи.');
  const active = unit.infantryCombatRuntime.activeFireTask;
  if (active?.taskId === taskId) return pending('combat_lab_fire_task_running', 'Огневая задача ещё выполняется.');
  const terminal = unit.infantryCombatRuntime.lastFireResult;
  if (!terminal || terminal.taskId !== taskId) return pending('combat_lab_fire_task_terminal_waiting', 'Ожидание производственного результата огневой задачи.');
  if (terminal.phase !== 'completed') return failed(terminal.resultCode, terminal.resultRu);
  if (!requireResolvedShots) return completed('combat_lab_fire_task_completed', 'Огневая задача завершена производственной системой.');
  const commits = state.infantryCombatProjectiles.committedShots.filter((shot) => shot.fireTaskId === taskId);
  if (commits.length < terminal.committedRoundCount) return pending('combat_lab_shot_commit_waiting', 'Ожидание опубликованных записей зафиксированных выстрелов.');
  const resolvedShotIds = new Set<string>();
  for (const impact of state.infantryCombatProjectiles.impacts) resolvedShotIds.add(impact.shotId);
  for (const termination of state.infantryCombatProjectiles.terminations) resolvedShotIds.add(termination.shotId);
  return commits.every((commit) => resolvedShotIds.has(commit.shotId))
    ? completed('combat_lab_shots_resolved', 'Все зафиксированные выстрелы получили impact или termination.')
    : pending('combat_lab_shots_resolving', 'Ожидание разрешения физических снарядов.');
}

function ammoActionCompletion(state: SimulationState, observation: CombatLabCompletionObservationV1, kind: 'reload' | 'transfer'): CombatLabCompletionEvaluationV1 {
  const unit = findUnit(state, kind === 'transfer' ? observation.sourceUnitId : observation.actorUnitId);
  if (!unit || !observation.actionId) return failed('combat_lab_ammo_action_identity_missing', 'Не удалось зафиксировать идентификатор действия с боеприпасами.');
  const active = kind === 'reload' ? unit.infantryCombatRuntime.ammoInventory.activeReload : unit.infantryCombatRuntime.ammoInventory.activeTransfer;
  if (active?.actionId === observation.actionId) return pending(`combat_lab_${kind}_running`, 'Действие с боеприпасами ещё выполняется.');
  const terminal = unit.infantryCombatRuntime.ammoInventory.lastActionResult;
  if (!terminal || terminal.actionId !== observation.actionId || terminal.kind !== kind) return pending(`combat_lab_${kind}_terminal_waiting`, 'Ожидание производственного результата действия с боеприпасами.');
  return terminal.status === 'completed' ? completed(`combat_lab_${kind}_completed`, terminal.resultRu) : failed(terminal.resultCode, terminal.resultRu);
}

function deploymentCompletion(state: SimulationState, observation: CombatLabCompletionObservationV1, kind: 'deploy' | 'undeploy'): CombatLabCompletionEvaluationV1 {
  const unit = findUnit(state, observation.actorUnitId);
  const deployment = unit?.infantryCombatRuntime.primaryWeapon?.deployment;
  if (!unit || !deployment || !observation.actionId) return failed('combat_lab_deployment_identity_missing', 'Не удалось зафиксировать идентификатор установки оружия.');
  if (deployment.activeAction?.actionId === observation.actionId) return pending('combat_lab_deployment_running', 'Установка или снятие оружия ещё выполняется.');
  const terminal = deployment.lastActionResult;
  if (!terminal || terminal.actionId !== observation.actionId || terminal.kind !== kind) return pending('combat_lab_deployment_terminal_waiting', 'Ожидание производственного результата установки оружия.');
  return terminal.status === 'completed' ? completed(`combat_lab_${kind}_completed`, terminal.resultRu) : failed(terminal.resultCode, terminal.resultRu);
}

function firstAidCompletion(state: SimulationState, observation: CombatLabCompletionObservationV1): CombatLabCompletionEvaluationV1 {
  const unit = findUnit(state, observation.actorUnitId);
  if (!unit || !observation.actionId) return failed('combat_lab_first_aid_identity_missing', 'Не удалось зафиксировать идентификатор первой помощи.');
  if (unit.infantryCombatRuntime.medical.activeFirstAidAction?.actionId === observation.actionId) return pending('combat_lab_first_aid_running', 'Первая помощь ещё выполняется.');
  const terminal = unit.infantryCombatRuntime.medical.lastFirstAidResult;
  if (!terminal || terminal.actionId !== observation.actionId) return pending('combat_lab_first_aid_terminal_waiting', 'Ожидание производственного результата первой помощи.');
  return terminal.status === 'completed' ? completed('combat_lab_first_aid_completed', terminal.resultRu) : failed(terminal.resultCode, terminal.resultRu);
}

function observableActionId(action: CombatLabActionV1, unit: UnitModel | null, startedSeconds: number): string | null {
  if (!unit) return null;
  if (action.kind === 'reload' || action.kind === 'transfer') {
    const inventory = unit.infantryCombatRuntime.ammoInventory;
    const active = action.kind === 'reload' ? inventory.activeReload : inventory.activeTransfer;
    if (active) return active.actionId;
    const terminal = inventory.lastActionResult;
    return terminal?.kind === action.kind && terminal.endedSeconds + 1e-9 >= startedSeconds ? terminal.actionId : null;
  }
  if (action.kind === 'deploy' || action.kind === 'undeploy') {
    const deployment = unit.infantryCombatRuntime.primaryWeapon?.deployment;
    if (deployment?.activeAction) return deployment.activeAction.actionId;
    const terminal = deployment?.lastActionResult;
    return terminal?.kind === action.kind && terminal.endedSeconds + 1e-9 >= startedSeconds ? terminal.actionId : null;
  }
  if (action.kind === 'first_aid') {
    const medical = unit.infantryCombatRuntime.medical;
    if (medical.activeFirstAidAction) return medical.activeFirstAidAction.actionId;
    const terminal = medical.lastFirstAidResult;
    return terminal && terminal.endedSeconds + 1e-9 >= startedSeconds ? terminal.actionId : null;
  }
  if (action.kind === 'posture') return unit.behaviorRuntime.physicalAction?.id ?? null;
  return null;
}

function observableFireTaskId(unit: UnitModel | null, startedSeconds: number): string | null {
  if (!unit) return null;
  if (unit.infantryCombatRuntime.activeFireTask) return unit.infantryCombatRuntime.activeFireTask.taskId;
  const terminal = unit.infantryCombatRuntime.lastFireResult;
  return terminal && terminal.endedSeconds + 1e-9 >= startedSeconds ? terminal.taskId : null;
}

function actorForAction(experiment: CombatLabExperimentV1, state: SimulationState, action: CombatLabActionV1): UnitModel | null {
  if (action.kind === 'wait') return null;
  if (action.kind === 'transfer') return resolveCombatLabRoleUnit(experiment, state, action.sourceRoleId);
  return resolveCombatLabRoleUnit(experiment, state, action.actorRoleId);
}

function targetForAction(experiment: CombatLabExperimentV1, state: SimulationState, action: CombatLabActionV1): UnitModel | null {
  if (action.kind === 'fire' && action.target.kind === 'role') return resolveCombatLabRoleUnit(experiment, state, action.target.roleId);
  if (action.kind === 'transfer') return resolveCombatLabRoleUnit(experiment, state, action.targetRoleId);
  if (action.kind === 'first_aid') return resolveCombatLabRoleUnit(experiment, state, action.targetRoleId);
  return null;
}

function resolveFacingRadians(experiment: CombatLabExperimentV1, state: SimulationState, action: Extract<CombatLabActionV1, { kind: 'face' }>, actor: UnitModel | null): number | null {
  if (!actor) return null;
  const marker = experiment.markers.find((candidate) => candidate.markerId === action.markerId);
  if (!marker) return null;
  const targetX = marker.xMetres / Math.max(0.001, state.map.metersPerCell);
  const targetY = marker.yMetres / Math.max(0.001, state.map.metersPerCell);
  if (Math.hypot(targetX - actor.position.x, targetY - actor.position.y) < 0.001) return null;
  return Math.atan2(targetY - actor.position.y, targetX - actor.position.x);
}

function angularDistance(left: number, right: number): number {
  const delta = ((left - right + Math.PI) % (Math.PI * 2)) - Math.PI;
  return Math.abs(delta);
}
function findUnit(state: SimulationState, unitId: string | null): UnitModel | null { return unitId ? state.units.find((unit) => unit.id === unitId) ?? null : null; }
function pending(reasonCode: string, reasonRu: string): CombatLabCompletionEvaluationV1 { return { status: 'pending', reasonCode, reasonRu }; }
function completed(reasonCode: string, reasonRu: string): CombatLabCompletionEvaluationV1 { return { status: 'completed', reasonCode, reasonRu }; }
function failed(reasonCode: string, reasonRu: string): CombatLabCompletionEvaluationV1 { return { status: 'failed', reasonCode, reasonRu }; }
