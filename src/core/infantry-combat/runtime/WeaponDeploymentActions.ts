import {
  cancelPhysicalAction,
  completePhysicalAction,
  failPhysicalAction,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
} from '../../actions/PhysicalActionCoordinator';
import type { PhysicalActionHandleV1, PhysicalActionLeaseV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import { getCombatUnitSpatialIndex } from '../../combat/CombatUnitSpatialIndex';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import { assistantLeaseStillValid, requestAssistantLease } from './MachineGunAssistant';
import {
  appendDeploymentResult,
  captureWeaponDeploymentAnchor,
  deploymentAnchorStillValid,
  invalidateWeaponDeployment,
} from './WeaponDeploymentRuntime';
import {
  WEAPON_DEPLOYMENT_SCHEMA_VERSION,
  type WeaponDeploymentActionKind,
  type WeaponDeploymentActionResultV1,
  type WeaponDeploymentActionV1,
} from './WeaponDeploymentTypes';

export const DEPLOY_WEAPON_ACTION_TYPE = 'infantry_deploy_weapon' as const;
export const UNDEPLOY_WEAPON_ACTION_TYPE = 'infantry_undeploy_weapon' as const;
export const DEPLOYMENT_ASSISTANT_ACTION_TYPE = 'infantry_assist_weapon_deployment' as const;
const EPSILON = 1e-9;

export interface RequestWeaponDeploymentInput {
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly helperUnitId: string | null;
  readonly requestedSeconds: number;
}

export interface RequestWeaponDeploymentResult {
  readonly accepted: boolean;
  readonly status: 'started' | 'already_running' | 'unsupported_weapon' | 'invalid_state' | 'channels_blocked';
  readonly gunnerLease: PhysicalActionLeaseV1 | null;
  readonly helperLease: PhysicalActionLeaseV1 | null;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface TickWeaponActionInput { readonly intervalStartSeconds: number; readonly deltaSeconds: number; }

export function requestDeployWeapon(
  state: SimulationState,
  gunner: UnitModel,
  input: RequestWeaponDeploymentInput,
): RequestWeaponDeploymentResult {
  return requestDeploymentAction(state, gunner, input, 'deploy');
}

export function requestUndeployWeapon(
  state: SimulationState,
  gunner: UnitModel,
  input: RequestWeaponDeploymentInput,
): RequestWeaponDeploymentResult {
  return requestDeploymentAction(state, gunner, input, 'undeploy');
}

export function cancelWeaponDeploymentAction(
  state: SimulationState,
  gunner: UnitModel,
  ownerToken: string,
  endedSeconds: number,
): { readonly status: 'cancelled' | 'not_found' | 'owner_mismatch' } {
  const weapon = gunner.infantryCombatRuntime.primaryWeapon;
  const action = weapon?.deployment.activeAction;
  if (!weapon || !action) return { status: 'not_found' };
  if (action.ownerToken !== ownerToken) return { status: 'owner_mismatch' };
  if (action.actionHandle && getPhysicalActionLease(gunner, action.actionHandle)) {
    cancelPhysicalAction(gunner, action.actionHandle, {
      endedSeconds,
      resultCode: 'weapon_deployment_cancelled',
      resultRu: 'Действие с установкой пулемёта отменено.',
    });
  }
  releaseHelperLease(state, action.helperUnitId, action.helperActionHandle, endedSeconds, 'cancelled');
  restoreStateAfterUnfinishedAction(weapon, action);
  finishDeploymentRecord(
    weapon,
    action.actionId,
    action.kind,
    'cancelled',
    endedSeconds,
    'weapon_deployment_cancelled',
    'Действие с установкой пулемёта отменено.',
  );
  weapon.deployment.activeAction = null;
  weapon.deployment.revision = increment(weapon.deployment.revision);
  return { status: 'cancelled' };
}

export function tickWeaponDeploymentActions(state: SimulationState, input: TickWeaponActionInput): void {
  const start = finiteNonNegative(input.intervalStartSeconds);
  const delta = finiteNonNegative(input.deltaSeconds);
  if (delta <= EPSILON) return;
  for (const gunner of [...state.units].sort(compareUnits)) {
    const weapon = gunner.infantryCombatRuntime.primaryWeapon;
    const action = weapon?.deployment.activeAction;
    if (!weapon || !action) continue;
    if (action.weaponInstanceId !== weapon.weaponInstanceId) {
      failDeployment(state, gunner, start, 'weapon_deployment_weapon_replaced', 'Экземпляр пулемёта был заменён во время действия.');
      continue;
    }
    if (!action.actionHandle || !getPhysicalActionLease(gunner, action.actionHandle)) {
      failDeployment(state, gunner, start, 'weapon_deployment_ownership_lost', 'Потерян захват физических каналов пулемётчика.');
      continue;
    }
    const capabilities = getEffectiveCombatCapabilities(gunner);
    if (!capabilities.alive || !capabilities.conscious || !capabilities.canUseWeapon || !capabilities.canMove) {
      failDeployment(state, gunner, start, 'weapon_deployment_capability_lost', 'Физическое состояние не позволяет продолжать действие с пулемётом.');
      continue;
    }

    let assisted = false;
    if (action.helperActionHandle && assistantLeaseStillValid(state, gunner, action.helperUnitId, action.helperActionHandle)) {
      assisted = true;
    } else if (action.helperActionHandle) {
      releaseHelperLease(state, action.helperUnitId, action.helperActionHandle, start, 'assistant_lost');
      action.helperActionHandle = null;
      action.helperUnitId = null;
      action.helperValidationCode = 'assistant_lost';
    }

    const multiplier = assisted ? clamp(weapon.resolved.weapon.assistantDeployMultiplier, 0.25, 1) : 1;
    const baseRemaining = Math.max(0, action.requiredBaseWorkSeconds - action.completedBaseWorkSeconds);
    const realSecondsToComplete = baseRemaining * multiplier;
    const usedSeconds = Math.min(delta, realSecondsToComplete);
    action.completedBaseWorkSeconds = Math.min(
      action.requiredBaseWorkSeconds,
      canonical(action.completedBaseWorkSeconds + usedSeconds / multiplier),
    );
    action.lastAdvancedSeconds = canonical(start + usedSeconds);
    if (action.completedBaseWorkSeconds + EPSILON < action.requiredBaseWorkSeconds) continue;

    const endedSeconds = canonical(start + usedSeconds);
    completePhysicalAction(gunner, action.actionHandle, {
      endedSeconds,
      resultCode: action.kind === 'deploy' ? 'weapon_deployed' : 'weapon_undeployed',
      resultRu: action.kind === 'deploy' ? 'Пулемёт установлен.' : 'Пулемёт снят с установки.',
    });
    releaseHelperLease(state, action.helperUnitId, action.helperActionHandle, endedSeconds, 'completed');
    if (action.kind === 'deploy') {
      const anchor = captureWeaponDeploymentAnchor(state.map, gunner);
      weapon.deployment.mode = 'deployed';
      weapon.deployment.anchor = anchor;
      weapon.deployment.traverseCenterRadians = anchor.facingRadians;
      weapon.deployment.deployedAtSeconds = endedSeconds;
    } else {
      weapon.deployment.mode = 'portable';
      weapon.deployment.anchor = null;
      weapon.deployment.traverseCenterRadians = null;
      weapon.deployment.deployedAtSeconds = null;
    }
    weapon.deployment.invalidationReason = null;
    finishDeploymentRecord(
      weapon,
      action.actionId,
      action.kind,
      'completed',
      endedSeconds,
      action.kind === 'deploy' ? 'weapon_deployed' : 'weapon_undeployed',
      action.kind === 'deploy' ? 'Пулемёт установлен.' : 'Пулемёт снят с установки.',
    );
    weapon.deployment.activeAction = null;
    weapon.deployment.revision = increment(weapon.deployment.revision);
  }
}

export function reconcileWeaponDeploymentAnchors(state: SimulationState, reconciledSeconds: number): void {
  for (const unit of [...state.units].sort(compareUnits)) {
    const weapon = unit.infantryCombatRuntime.primaryWeapon;
    if (!weapon || weapon.deployment.mode !== 'deployed' || !weapon.deployment.anchor) continue;
    if (deploymentAnchorStillValid(state.map, unit, weapon.deployment.anchor)) continue;
    if (!invalidateWeaponDeployment(weapon, 'deployment_anchor_invalidated')) continue;
    const task = unit.infantryCombatRuntime.activeFireTask;
    if (!task) continue;
    const handle = task.actionHandle;
    if (handle && getPhysicalActionLease(unit, handle)) {
      failPhysicalAction(unit, handle, {
        endedSeconds: reconciledSeconds,
        resultCode: 'deployment_anchor_invalidated',
        resultRu: 'Огневая задача отменена: установленный пулемёт был физически смещён.',
      });
    }
    unit.infantryCombatRuntime.activeFireTask = null;
  }
}

function requestDeploymentAction(
  state: SimulationState,
  gunner: UnitModel,
  input: RequestWeaponDeploymentInput,
  kind: WeaponDeploymentActionKind,
): RequestWeaponDeploymentResult {
  const weapon = gunner.infantryCombatRuntime.primaryWeapon;
  if (!weapon || weapon.resolved.weapon.weaponClass !== 'machine_gun') {
    return rejected('unsupported_weapon', 'weapon_deployment_unsupported', 'У бойца нет переносного пулемёта для этого действия.');
  }
  const deployment = weapon.deployment;
  if (deployment.activeAction) {
    if (deployment.activeAction.ownerToken === input.ownerToken && deployment.activeAction.kind === kind) {
      return {
        accepted: true,
        status: 'already_running',
        gunnerLease: deployment.activeAction.actionHandle
          ? getPhysicalActionLease(gunner, deployment.activeAction.actionHandle)
          : null,
        helperLease: helperLease(state, deployment.activeAction.helperUnitId, deployment.activeAction.helperActionHandle),
        reasonCode: 'weapon_deployment_already_running',
        reasonRu: 'Такое действие с пулемётом уже выполняется.',
      };
    }
    return rejected('invalid_state', 'weapon_deployment_action_in_progress', 'Другое действие с установкой пулемёта уже выполняется.');
  }
  if (kind === 'deploy' && deployment.mode !== 'portable') {
    return rejected('invalid_state', 'weapon_deployment_invalid_state', 'Установить можно только переносной пулемёт.');
  }
  if (kind === 'undeploy' && deployment.mode !== 'deployed') {
    return rejected('invalid_state', 'weapon_undeployment_invalid_state', 'Снять с установки можно только установленный пулемёт.');
  }
  const capabilities = getEffectiveCombatCapabilities(gunner);
  if (!capabilities.alive || !capabilities.conscious || !capabilities.canUseWeapon || !capabilities.canMove) {
    return rejected('invalid_state', 'weapon_deployment_capability_lost', 'Физическое состояние не позволяет выполнить действие с пулемётом.');
  }
  if (gunner.movementRuntime.isMoving || Math.hypot(
    gunner.movementRuntime.velocityCellsPerSecond.x,
    gunner.movementRuntime.velocityCellsPerSecond.y,
  ) > EPSILON) {
    return rejected('invalid_state', 'weapon_deployment_requires_stationary', 'Для действия с пулемётом боец должен остановиться.');
  }
  if (gunner.infantryCombatRuntime.activeFireTask
    || gunner.infantryCombatRuntime.ammoInventory.activeReload
    || gunner.infantryCombatRuntime.ammoInventory.activeTransfer) {
    return rejected('channels_blocked', 'weapon_action_in_progress', 'Канал оружия занят другим физическим действием.');
  }
  const requiredBaseWorkSeconds = kind === 'deploy'
    ? finiteNonNegative(weapon.resolved.weapon.deploySeconds)
    : finiteNonNegative(weapon.resolved.weapon.undeploySeconds);
  if (requiredBaseWorkSeconds <= EPSILON) {
    return rejected('invalid_state', 'weapon_deployment_duration_invalid', 'В опубликованном профиле задана неверная длительность действия.');
  }

  const startedSeconds = finiteNonNegative(input.requestedSeconds);
  const actionType = kind === 'deploy' ? DEPLOY_WEAPON_ACTION_TYPE : UNDEPLOY_WEAPON_ACTION_TYPE;
  const gunnerRequest = requestPhysicalActionChannels(gunner, {
    actionType,
    owner: input.owner,
    ownerToken: input.ownerToken,
    channels: ['locomotion', 'posture', 'weapon'],
    startedSeconds,
    reasonCode: kind === 'deploy' ? 'weapon_deployment_requested' : 'weapon_undeployment_requested',
    reasonRu: kind === 'deploy' ? 'Начата установка пулемёта.' : 'Начато снятие пулемёта с установки.',
  });
  if (!gunnerRequest.accepted || !gunnerRequest.handle || !gunnerRequest.lease) {
    return rejected('channels_blocked', gunnerRequest.reasonCode, gunnerRequest.reasonRu);
  }

  const helperRequest = requestAssistantLease({
    state,
    gunner,
    helperUnitId: input.helperUnitId,
    actionType: DEPLOYMENT_ASSISTANT_ACTION_TYPE,
    ownerToken: input.ownerToken,
    channels: ['locomotion', 'weapon'],
    startedSeconds,
  });
  const helper = helperRequest.handle && helperRequest.validation.helper ? helperRequest.validation.helper : null;
  const sequence = deployment.nextActionSequence;
  deployment.nextActionSequence = increment(sequence);
  deployment.mode = kind === 'deploy' ? 'deploying' : 'undeploying';
  deployment.activeAction = {
    schemaVersion: WEAPON_DEPLOYMENT_SCHEMA_VERSION,
    actionId: `${weapon.weaponInstanceId}:${kind}:${sequence}`,
    sequence,
    kind,
    weaponInstanceId: weapon.weaponInstanceId,
    owner: { ...input.owner },
    ownerToken: input.ownerToken,
    actionHandle: gunnerRequest.handle,
    helperUnitId: helper?.id ?? null,
    helperActionHandle: helperRequest.handle,
    helperValidationCode: helperRequest.validation.reasonCode,
    requiredBaseWorkSeconds,
    completedBaseWorkSeconds: 0,
    startedSeconds,
    lastAdvancedSeconds: startedSeconds,
    anchorBeforeAction: kind === 'undeploy' ? deployment.anchor : null,
  };
  deployment.revision = increment(deployment.revision);
  return {
    accepted: true,
    status: 'started',
    gunnerLease: gunnerRequest.lease,
    helperLease: helper ? getPhysicalActionLease(helper, helperRequest.handle!) : null,
    reasonCode: kind === 'deploy' ? 'weapon_deployment_started' : 'weapon_undeployment_started',
    reasonRu: kind === 'deploy' ? 'Установка пулемёта начата.' : 'Снятие пулемёта с установки начато.',
  };
}

function failDeployment(
  state: SimulationState,
  gunner: UnitModel,
  endedSeconds: number,
  code: string,
  text: string,
): void {
  const weapon = gunner.infantryCombatRuntime.primaryWeapon;
  const action = weapon?.deployment.activeAction;
  if (!weapon || !action) return;
  if (action.actionHandle && getPhysicalActionLease(gunner, action.actionHandle)) {
    failPhysicalAction(gunner, action.actionHandle, { endedSeconds, resultCode: code, resultRu: text });
  }
  releaseHelperLease(state, action.helperUnitId, action.helperActionHandle, endedSeconds, 'failed');
  restoreStateAfterUnfinishedAction(weapon, action);
  finishDeploymentRecord(weapon, action.actionId, action.kind, 'failed', endedSeconds, code, text);
  weapon.deployment.activeAction = null;
  weapon.deployment.revision = increment(weapon.deployment.revision);
}

function restoreStateAfterUnfinishedAction(
  weapon: NonNullable<UnitModel['infantryCombatRuntime']['primaryWeapon']>,
  action: WeaponDeploymentActionV1,
): void {
  if (action.kind === 'undeploy' && action.anchorBeforeAction) {
    weapon.deployment.mode = 'deployed';
    weapon.deployment.anchor = action.anchorBeforeAction;
    weapon.deployment.traverseCenterRadians = action.anchorBeforeAction.facingRadians;
    return;
  }
  weapon.deployment.mode = 'portable';
  weapon.deployment.anchor = null;
  weapon.deployment.traverseCenterRadians = null;
  weapon.deployment.deployedAtSeconds = null;
}

function finishDeploymentRecord(
  weapon: NonNullable<UnitModel['infantryCombatRuntime']['primaryWeapon']>,
  actionId: string,
  kind: WeaponDeploymentActionKind,
  status: WeaponDeploymentActionResultV1['status'],
  endedSeconds: number,
  resultCode: string,
  resultRu: string,
): void {
  appendDeploymentResult(weapon.deployment, { actionId, kind, status, endedSeconds, resultCode, resultRu });
}

function helperLease(
  state: SimulationState,
  helperUnitId: string | null,
  handle: PhysicalActionHandleV1 | null,
): PhysicalActionLeaseV1 | null {
  if (!helperUnitId || !handle) return null;
  const helper = getCombatUnitSpatialIndex(state).unitsById.get(helperUnitId);
  return helper ? getPhysicalActionLease(helper, handle) : null;
}

function releaseHelperLease(
  state: SimulationState,
  helperUnitId: string | null,
  handle: PhysicalActionHandleV1 | null,
  endedSeconds: number,
  status: 'completed' | 'cancelled' | 'failed' | 'assistant_lost',
): void {
  if (!helperUnitId || !handle) return;
  const helper = getCombatUnitSpatialIndex(state).unitsById.get(helperUnitId);
  if (!helper || !getPhysicalActionLease(helper, handle)) return;
  if (status === 'completed') {
    completePhysicalAction(helper, handle, { endedSeconds, resultCode: 'assistant_action_completed', resultRu: 'Помощь завершена.' });
  } else if (status === 'failed') {
    failPhysicalAction(helper, handle, { endedSeconds, resultCode: 'assistant_action_failed', resultRu: 'Помощь завершена с ошибкой.' });
  } else {
    cancelPhysicalAction(helper, handle, {
      endedSeconds,
      resultCode: status === 'assistant_lost' ? 'assistant_lost' : 'assistant_action_cancelled',
      resultRu: status === 'assistant_lost' ? 'Помощник больше не может участвовать.' : 'Помощь отменена.',
    });
  }
}

function rejected(
  status: RequestWeaponDeploymentResult['status'],
  reasonCode: string,
  reasonRu: string,
): RequestWeaponDeploymentResult {
  return { accepted: false, status, gunnerLease: null, helperLease: null, reasonCode, reasonRu };
}
function increment(value: number): number { return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(value)) + 1); }
function finiteNonNegative(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum)); }
function canonical(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function compareUnits(left: UnitModel, right: UnitModel): number { return left.id < right.id ? -1 : left.id > right.id ? 1 : 0; }
