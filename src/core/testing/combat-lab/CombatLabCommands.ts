import { requestPlayerPostureTransition } from '../../actions/PostureTransition';
import {
  cancelActiveFirstAidAction,
  cancelAmmoTransfer,
  cancelReloadWeapon,
  cancelSingleFireTask,
  cancelWeaponDeploymentAction,
  requestAmmoTransfer,
  requestApplyFirstAidAction,
  requestDeployWeapon,
  requestFireTask,
  requestReloadWeapon,
  requestUndeployWeapon,
} from '../../infantry-combat/runtime';
import { issueMoveOrderToSelectedUnit, selectUnit, type SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import type { CombatLabCommandResultV1, CombatLabScriptCommandV1 } from './CombatLabContracts';

export interface CombatLabCommandContextV1 {
  readonly ownerId: string;
  readonly commandSequence: number;
  readonly interactive: boolean;
}

export function executeCombatLabCommand(
  state: SimulationState,
  command: CombatLabScriptCommandV1,
  context: CombatLabCommandContextV1,
): CombatLabCommandResultV1 {
  const ownerToken = `combat-lab:${context.ownerId}:${context.commandSequence}`;
  const owner = { source: 'test' as const, id: context.ownerId };
  const now = state.simulationTimeSeconds;

  if (command.kind === 'fire') {
    const shooter = findUnit(state, command.shooterUnitId);
    if (!shooter) return missingUnit(command.shooterUnitId);
    const targetUnit = command.targetUnitId ? findUnit(state, command.targetUnitId) : null;
    if (command.targetUnitId && !targetUnit) return missingUnit(command.targetUnitId);
    const target = command.targetPointMetres ?? (targetUnit ? unitAimPointMetres(state, targetUnit) : null);
    if (!target) return rejected('combat_lab_target_missing', 'Не выбрана цель-боец или точка цели.');
    const targetContactId = targetUnit ? resolveProductionContactId(shooter, targetUnit.id) : null;
    const result = requestFireTask(shooter, {
      owner,
      ownerToken,
      target,
      targetRadiusMetres: command.mode === 'suppress' ? command.targetRadiusMetres : 0,
      contactId: targetContactId,
      sourceUnitId: targetUnit?.id ?? null,
      mode: command.mode,
      minimumSolutionQuality: command.minimumSolutionQuality,
      maximumFriendlyFireRisk: 1,
      requestedSeconds: now,
    });
    return normalizeProductionResult(result, ownerToken);
  }

  if (command.kind === 'cancel_fire') {
    const unit = findUnit(state, command.unitId);
    if (!unit) return missingUnit(command.unitId);
    const token = unit.infantryCombatRuntime.activeFireTask?.ownerToken;
    if (!token) return rejected('combat_lab_fire_task_missing', 'У бойца нет активной огневой задачи.');
    return normalizeProductionResult(cancelSingleFireTask(unit, {
      ownerToken: token,
      endedSeconds: now,
      resultCode: 'combat_lab_fire_task_cancelled',
      resultRu: 'Огневая задача остановлена пользователем испытательного полигона.',
    }), token);
  }

  if (command.kind === 'posture') {
    const unit = findUnit(state, command.unitId);
    if (!unit) return missingUnit(command.unitId);
    return normalizeProductionResult(
      requestPlayerPostureTransition(unit, command.targetPosture, now, context.ownerId),
      ownerToken,
    );
  }

  if (command.kind === 'move') {
    const unit = findUnit(state, command.unitId);
    if (!unit) return missingUnit(command.unitId);
    const previousSelectedUnitId = state.selectedUnitId;
    const previousSelectedUnitIds = [...state.selectedUnitIds];
    selectUnit(state, unit.id);
    issueMoveOrderToSelectedUnit(state, command.targetGrid);
    state.selectedUnitId = previousSelectedUnitId;
    state.selectedUnitIds = previousSelectedUnitIds;
    return unit.order
      ? accepted('combat_lab_move_requested', 'Маршрут движения передан производственной системе.', ownerToken)
      : rejected('combat_lab_move_rejected', unit.behaviorRuntime.reason || 'Производственная система не приняла движение.');
  }

  if (command.kind === 'reload') {
    const unit = findUnit(state, command.unitId);
    if (!unit) return missingUnit(command.unitId);
    return normalizeProductionResult(requestReloadWeapon(state, unit, {
      owner,
      ownerToken,
      helperUnitId: command.helperUnitId,
      requestedSeconds: now,
    }), ownerToken);
  }

  if (command.kind === 'deploy' || command.kind === 'undeploy') {
    const unit = findUnit(state, command.unitId);
    if (!unit) return missingUnit(command.unitId);
    const input = { owner, ownerToken, helperUnitId: command.helperUnitId, requestedSeconds: now };
    const result = command.kind === 'deploy'
      ? requestDeployWeapon(state, unit, input)
      : requestUndeployWeapon(state, unit, input);
    return normalizeProductionResult(result, ownerToken);
  }

  if (command.kind === 'transfer') {
    const source = findUnit(state, command.sourceUnitId);
    const target = findUnit(state, command.targetUnitId);
    if (!source) return missingUnit(command.sourceUnitId);
    if (!target) return missingUnit(command.targetUnitId);
    const ammoDefinitionId = target.infantryCombatRuntime.primaryWeapon?.resolved.ammoDefinitionRef.definitionId
      ?? source.infantryCombatRuntime.primaryWeapon?.resolved.ammoDefinitionRef.definitionId;
    if (!ammoDefinitionId) return rejected('combat_lab_ammo_missing', 'Не удалось определить опубликованный тип патрона для передачи.');
    return normalizeProductionResult(requestAmmoTransfer(state, {
      sourceUnitId: source.id,
      targetUnitId: target.id,
      ammoDefinitionId,
      requestedRounds: Math.max(1, Math.trunc(command.requestedRounds)),
      ownerToken,
      requestedSeconds: now,
    }), ownerToken);
  }

  if (command.kind !== 'first_aid') {
    return rejected('combat_lab_command_unsupported', `Команда ${command.kind} не поддерживается испытательным полигоном.`);
  }
  const actor = findUnit(state, command.actorUnitId);
  const target = findUnit(state, command.targetUnitId);
  if (!actor) return missingUnit(command.actorUnitId);
  if (!target) return missingUnit(command.targetUnitId);
  return normalizeProductionResult(requestApplyFirstAidAction(state, actor, {
    owner,
    ownerToken,
    targetUnitId: target.id,
    zone: command.zone,
    requestedSeconds: now,
  }), ownerToken);
}

export function cancelCombatLabWeaponAction(
  state: SimulationState,
  unitId: string,
  action: 'fire' | 'reload' | 'deployment' | 'transfer' | 'first_aid',
): CombatLabCommandResultV1 {
  const unit = findUnit(state, unitId);
  if (!unit) return missingUnit(unitId);
  const now = state.simulationTimeSeconds;
  if (action === 'fire') {
    const token = unit.infantryCombatRuntime.activeFireTask?.ownerToken;
    if (!token) return rejected('combat_lab_fire_task_missing', 'Активная огневая задача не найдена.');
    return normalizeProductionResult(cancelSingleFireTask(unit, {
      ownerToken: token,
      endedSeconds: now,
      resultCode: 'combat_lab_fire_task_cancelled',
      resultRu: 'Огневая задача остановлена пользователем испытательного полигона.',
    }), token);
  }
  if (action === 'reload') {
    const token = unit.infantryCombatRuntime.ammoInventory.activeReload?.ownerToken;
    if (!token) return rejected('combat_lab_reload_missing', 'Активная перезарядка не найдена.');
    return normalizeProductionResult(cancelReloadWeapon(state, unit, token, now), token);
  }
  if (action === 'deployment') {
    const token = unit.infantryCombatRuntime.primaryWeapon?.deployment.activeAction?.ownerToken;
    if (!token) return rejected('combat_lab_deployment_missing', 'Активная установка или снятие пулемёта не найдены.');
    return normalizeProductionResult(cancelWeaponDeploymentAction(state, unit, token, now), token);
  }
  if (action === 'transfer') {
    const actionId = unit.infantryCombatRuntime.ammoInventory.activeTransfer?.actionId;
    if (!actionId) return rejected('combat_lab_transfer_missing', 'Активная передача патронов не найдена.');
    return normalizeProductionResult(cancelAmmoTransfer(state, actionId, now), actionId);
  }
  const acceptedCancel = cancelActiveFirstAidAction(
    unit,
    now,
    'combat_lab_first_aid_cancelled',
    'Первая помощь отменена пользователем испытательного полигона.',
  );
  return acceptedCancel
    ? accepted('combat_lab_first_aid_cancelled', 'Первая помощь отменена.', null)
    : rejected('combat_lab_first_aid_missing', 'Активная первая помощь не найдена.');
}

function unitAimPointMetres(state: SimulationState, unit: UnitModel) {
  return {
    xMetres: unit.position.x * state.map.metersPerCell,
    yMetres: unit.position.y * state.map.metersPerCell,
    zMetres: unit.behaviorRuntime.posture === 'prone' ? 0.35 : unit.behaviorRuntime.posture === 'crouched' ? 1.05 : 1.45,
  };
}

function resolveProductionContactId(shooter: UnitModel, targetUnitId: string): string | null {
  const matching = shooter.perceptionKnowledge.contacts
    .filter((contact) => contact.sourceUnitId === targetUnitId)
    .sort((left, right) => (
      Number(right.visibleNow) - Number(left.visibleNow)
      || Number(right.observedNow) - Number(left.observedNow)
      || right.confidence - left.confidence
      || right.lastUpdatedSeconds - left.lastUpdatedSeconds
      || left.id.localeCompare(right.id)
    ));
  return matching[0]?.id ?? null;
}

function normalizeProductionResult(value: unknown, ownerToken: string | null): CombatLabCommandResultV1 {
  const record = isRecord(value) ? value : {};
  const status = text(record.status, 'unknown');
  const acceptedValue = record.accepted;
  const acceptedResult = acceptedValue === true || (acceptedValue === undefined && ['started', 'already_running', 'completed', 'cancelled'].includes(status));
  return {
    accepted: acceptedResult,
    reasonCode: text(record.reasonCode, status === 'unknown' ? 'combat_lab_production_result_unknown' : status),
    reasonRu: text(record.reasonRu, acceptedResult ? 'Команда принята производственной системой.' : `Команда отклонена: ${status}.`),
    ownerToken,
  };
}

function findUnit(state: SimulationState, unitId: string): UnitModel | null {
  return state.units.find((unit) => unit.id === unitId) ?? null;
}
function missingUnit(unitId: string): CombatLabCommandResultV1 {
  return rejected('combat_lab_unit_missing', `Боец ${unitId} не найден в текущем стенде.`);
}
function accepted(reasonCode: string, reasonRu: string, ownerToken: string | null): CombatLabCommandResultV1 {
  return { accepted: true, reasonCode, reasonRu, ownerToken };
}
function rejected(reasonCode: string, reasonRu: string): CombatLabCommandResultV1 {
  return { accepted: false, reasonCode, reasonRu, ownerToken: null };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
