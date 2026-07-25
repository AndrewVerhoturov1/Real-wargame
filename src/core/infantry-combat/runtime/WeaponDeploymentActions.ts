import {
  cancelPhysicalAction,
  completePhysicalAction,
  failPhysicalAction,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
} from '../../actions/PhysicalActionCoordinator';
import { getCombatUnitSpatialIndex } from '../../combat/CombatUnitSpatialIndex';
import type { PhysicalActionLeaseV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
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
  gunner: UnitModel,
  ownerToken: string,
  endedSeconds: number,
): { readonly status: 'cancelled' | 'not_found' | 'owner_mismatch' } {
  const weapon = gunner.infantryCombatRuntime.primaryWeapon;
  const action = weapon?.deployment.activeAction;
  if (!weapon || !action) return { status: 'not_found' };
  if (action.ownerToken !== ownerToken) return { status: 'owner_mismatch' };
  cancelPhysicalAction(gunner, action.actionHandle, {
    endedSeconds,
    resultCode: 'weapon_deployment_cancelled',
    resultRu: 'Действие с установкой пулемёта отменено.',
  });
  finalizeHelperLeaseById(gunner, action.helperUnitId, action.helperActionHandle, endedSeconds, 'cancelled');
  if (action.kind === 'deploy') {
    weapon.deployment.mode = 'portable';
    weapon.deployment.anchor = null;
    weapon.deployment.traverseCenterRadians = null;
    weapon.deployment.deployedAtSeconds = null;
  } else {
    weapon.deployment.mode = 'deployed';
    weapon.deployment.anchor = action.anchorBeforeAction;
    weapon.deployment.traverseCenterRadians = action.anchorBeforeAction?.facingRadians ?? weapon.deployment.traverseCenterRadians;
  }
  finishDeploymentRecord(weapon, action.actionId, action.kind, 'cancelled', endedSeconds, 'weapon_deployment_cancelled', 'Действие с установкой пулемёта отменено.');
  weapon.deployment.activeAction = null;
  weapon.deployment.revision += 1;
  return { status: 'cancelled' };
}

export function tickWeaponDeploymentActions(state: SimulationState, input: TickWeaponActionInput): void {
  const start = finiteNonNegative(input.intervalStartSeconds);
  const delta = finiteNonNegative(input.deltaSeconds);
  if (delta <= EPSILON) return;
  const units = [...state.units].sort(compareUnits);
  for (const gunner of units) {
    const weapon = gunner.infantryCombatRuntime.primaryWeapon;
    const action = weapon?.deployment.activeAction;
    if (!weapon || !action) continue;
    if (!getPhysicalActionLease(gunner, action.actionHandle)) {
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
    const work = delta / multiplier;
    action.completedBaseWorkSeconds = Math.min(action.requiredBaseWorkSeconds, action.completedBaseWorkSeconds + work);
    action.lastAdvancedSeconds = start + delta;
    if (action.completedBaseWorkSeconds + EPSILON < action.requiredBaseWorkSeconds) continue;

    completePhysicalAction(gunner, action.actionHandle, {
      endedSeconds: start + delta,
      resultCode: action.kind === 'deploy' ? 'weapon_deployed' : 'weapon_undeployed',
      resultRu: action.kind === 'deploy' ? 'Пулемёт установлен.' : 'Пулемёт снят с установки.',
    });
    releaseHelperLease(state, action.helperUnitId, action.helperActionHandle, start + delta, 'completed');
    if (action.kind === 'deploy') {
      const anchor = captureWeaponDeploymentAnchor(state.map, gunner);
      weapon.deployment.mode = 'deployed';
      weapon.deployment.anchor = anchor;
      weapon.deployment.traverseCenterRadians = anchor.facingRadians;
      weapon.deployment.deployedAtSeconds = start + delta;
      weapon.deployment.invalidationReason = null;
    } else {
      weapon.deployment.mode = 'portable';
      weapon.deployment.anchor = null;
      weapon.deployment.traverseCenterRadians = null;
      weapon.deployment.deployedAtSeconds = null;
      weapon.deployment.invalidationReason = null;
    }
    finishDeploymentRecord(weapon, action.actionId, action.kind, 'completed', start + delta,
      action.kind === 'deploy' ? 'weapon_deployed' : 'weapon_undeployed',
      action.kind === 'deploy' ? 'Пулемёт установлен.' : 'Пулемёт снят с установки.');
    weapon.deployment.activeAction = null;
    weapon.deployment.revision += 1;
  }
}

export function reconcileWeaponDeploymentAnchors(state: SimulationState, reconciledSeconds: number): void {
  for (const unit of [...state.units].sort(compareUnits)) {
    const weapon = unit.infantryCombatRuntime.primaryWeapon;
    if (!weapon || weapon.deployment.mode !== 'deployed' || !weapon.deployment.anchor) continue;
    if (deploymentAnchorStillValid(state.map, unit, weapon.deployment.anchor)) continue;
    if (invalidateWeaponDeployment(weapon, 'weapon_deployment_anchor_invalidated')) {
      const task = unit.infantryCombatRuntime.activeFireTask;
      if (task) {
        const handle = task.actionHandle;
        if (handle) failPhysicalAction(unit, handle, {
          endedSeconds: reconciledSeconds,
          resultCode: 'weapon_deployment_anchor_invalidated',
          resultRu: 'Огневая задача отменена: установленный пулемёт был физически смещён.',
        });
        unit.infantryCombatRuntime.activeFireTask = null;
      }
    }
  }
}

function requestDeploymentAction(
  state: SimulationState,
  gunner: UnitModel,
  input: RequestWeaponDeploymentInput,
  kind: WeaponDeploymentActionKind,
): RequestWeaponDeploymentResult {
  const weapon = gunner.infantryCombatRuntime.primaryWeapon;
  if (!weapon || weapon.resolved.weapon.weaponClass !== 'machine_gun') return rejected('unsupported_weapon', 'weapon_deployment_unsupported', 'У бойца нет переносного пулемёта для этого действия.');
  const deployment = weapon.deployment;
  if (deployment.activeAction) {
    if (deployment.activeAction.ownerToken === input.ownerToken && deployment.activeAction.kind === kind) {
      return {
        accepted: true,
        status: 'already_running',
        gunnerLease: getPhysicalActionLease(gunner, deployment.activeAction.actionHandle),
        helperLease: helperLease(state, deployment.activeAction.helperUnitId, deployment.activeAction.helperActionHandle),
        reasonCode: 'weapon_deployment_already_running',
        reasonRu: 'Такое действие с пулемётом уже выполняется.',
      };
    }
    return rejected('invalid_state', 'weapon_deployment_action_in_progress', 'Другое действие с установкой пулемёта уже выполняется.');
  }
  if (kind === 'deploy' && deployment.mode !== 'portable') return rejected('invalid_state', 'weapon_deployment_invalid_state', 'Установить можно только переносной пулемёт.');
  if (kind === 'undeploy' && deployment.mode !== 'deployed') return rejected('invalid_state', 'weapon_undeployment_invalid_state', 'Снять с установки можно только установленный пулемёт.');
  if (gunner.infantryCombatRuntime.activeFireTask || gunner.infantryCombatRuntime.ammoInventory.activeReload || gunner.infantryCombatRuntime.ammoInventory.activeTransfer) {
    return rejected('channels_blocked', 'weapon_action_in_progress', 'Канал оружия занят другим физическим действием.');
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
  if (!gunnerRequest.accepted || !gunnerRequest.handle || !gunnerRequest.lease) return rejected('channels_blocked', gunnerRequest.reasonCode, gunnerRequest.reasonRu);

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
  deployment.nextActionSequence = Math.min(Number.MAX_SAFE_INTEGER, sequence + 1);
  deployment.mode = kind === 'deploy' ? 'deploying' : 'undeploying';
  deployment.activeAction = {
    schemaVersion: WEAPON_DEPLOYMENT_SCHEMA_VERSION,
    actionId: `${weapon.weaponInstanceId}:${kind}:${sequence}`,
    sequence,
    kind,
    owner: { ...input.owner },
    ownerToken: input.ownerToken,
    actionHandle: gunnerRequest.handle,
    helperUnitId: helper?.id ?? null,
    helperActionHandle: helperRequest.handle,
    helperValidationCode: helperRequest.validation.reasonCode,
    requiredBaseWorkSeconds: kind === 'deploy'
      ? finiteNonNegative(weapon.resolved.weapon.deploySeconds)
      : finiteNonNegative(weapon.resolved.weapon.undeploySeconds),
    completedBaseWorkSeconds: 0,
    startedSeconds,
    lastAdvancedSeconds: startedSeconds,
    anchorBeforeAction: kind === 'undeploy' ? deployment.anchor : null,
  };
  deployment.revision += 1;
  return {
    accepted: true,
    status: 'started',
    gunnerLease: gunnerRequest.lease,
    helperLease: helper ? getPhysicalActionLease(helper, helperRequest.handle!) : null,
    reasonCode: kind === 'deploy' ? 'weapon_deployment_started' : 'weapon_undeployment_started',
    reasonRu: kind === 'deploy' ? 'Установка пулемёта начата.' : 'Снятие пулемёта с установки начато.',
  };
}

function failDeployment(state: SimulationState, gunner: UnitModel, endedSeconds: number, code: string, text: string): void {
  const weapon = gunner.infantryCombatRuntime.primaryWeapon;
  const action = weapon?.deployment.activeAction;
  if (!weapon || !action) return;
  failPhysicalAction(gunner, action.actionHandle, { endedSeconds, resultCode: code, resultRu: text });
  releaseHelperLease(state, action.helperUnitId, action.helperActionHandle, endedSeconds, 'failed');
  if (action.kind === 'undeploy' && action.anchorBeforeAction) {
    weapon.deployment.mode = 'deployed';
    weapon.deployment.anchor = action.anchorBeforeAction;
    weapon.deployment.traverseCenterRadians = action.anchorBeforeAction.facingRadians;
  } else {
    weapon.deployment.mode = 'portable';
    weapon.deployment.anchor = null;
    weapon.deployment.traverseCenterRadians = null;
    weapon.deployment.deployedAtSeconds = null;
  }
  finishDeploymentRecord(weapon, action.actionId, action.kind, 'failed', endedSeconds, code, text);
  weapon.deployment.activeAction = null;
  weapon.deployment.revision += 1;
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

function helperLease(state: SimulationState, helperUnitId: string | null, handle: Parameters<typeof getPhysicalActionLease>[1] | null): PhysicalActionLeaseV1 | null {
  if (!helperUnitId || !handle) return null;
  const helper = getCombatUnitSpatialIndex(state).unitsById.get(helperUnitId);
  return helper ? getPhysicalActionLease(helper, handle) : null;
}
function releaseHelperLease(state: SimulationState, helperUnitId: string | null, handle: Parameters<typeof getPhysicalActionLease>[1] | null, endedSeconds: number, status: 'completed' | 'cancelled' | 'failed' | 'assistant_lost'): void {
  if (!helperUnitId || !handle) return;
  const helper = getCombatUnitSpatialIndex(state).unitsById.get(helperUnitId);
  if (!helper || !getPhysicalActionLease(helper, handle)) return;
  if (status === 'completed') completePhysicalAction(helper, handle, { endedSeconds, resultCode: 'assistant_action_completed', resultRu: 'Помощь завершена.' });
  else if (status === 'failed') failPhysicalAction(helper, handle, { endedSeconds, resultCode: 'assistant_action_failed', resultRu: 'Помощь завершена с ошибкой.' });
  else cancelPhysicalAction(helper, handle, { endedSeconds, resultCode: status === 'assistant_lost' ? 'assistant_lost' : 'assistant_action_cancelled', resultRu: status === 'assistant_lost' ? 'Помощник больше не может участвовать.' : 'Помощь отменена.' });
}
function finalizeHelperLeaseById(_gunner: UnitModel, _helperUnitId: string | null, _handle: Parameters<typeof getPhysicalActionLease>[1] | null, _endedSeconds: number, _status: 'cancelled'): void {
  // Public cancellation has no SimulationState. Reconciliation removes a stale helper lease; normal callers should use tick/capability paths.
}
function rejected(status: RequestWeaponDeploymentResult['status'], reasonCode: string, reasonRu: string): RequestWeaponDeploymentResult { return { accepted: false, status, gunnerLease: null, helperLease: null, reasonCode, reasonRu }; }
function finiteNonNegative(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum)); }
function compareUnits(left: UnitModel, right: UnitModel): number { return left.id < right.id ? -1 : left.id > right.id ? 1 : 0; }
