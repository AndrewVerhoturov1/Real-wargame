import {
  cancelPhysicalActionBySystem,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
} from '../../actions/PhysicalActionCoordinator';
import type { PhysicalActionChannel, PhysicalActionHandleV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import { getCombatUnitSpatialIndex } from '../../combat/CombatUnitSpatialIndex';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  AMMO_TRANSFER_SOURCE_ACTION_TYPE,
  AMMO_TRANSFER_TARGET_ACTION_TYPE,
} from './AmmoTransferAction';
import { appendBoundedLedger } from './AmmoInventoryRuntime';
import {
  MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS,
  type AmmoTransferActionV1,
} from './AmmoInventoryTypes';
import { validateMachineGunAssistant } from './MachineGunAssistant';
import {
  DEPLOYMENT_ASSISTANT_ACTION_TYPE,
  DEPLOY_WEAPON_ACTION_TYPE,
  UNDEPLOY_WEAPON_ACTION_TYPE,
} from './WeaponDeploymentActions';
import {
  RELOAD_ASSISTANT_ACTION_TYPE,
  RELOAD_LOCOMOTION_ACTION_TYPE,
  RELOAD_WEAPON_ACTION_TYPE,
} from './ReloadWeaponAction';

const STAGE9_ACTION_TYPES: ReadonlySet<string> = new Set<string>([
  DEPLOY_WEAPON_ACTION_TYPE,
  UNDEPLOY_WEAPON_ACTION_TYPE,
  DEPLOYMENT_ASSISTANT_ACTION_TYPE,
  RELOAD_WEAPON_ACTION_TYPE,
  RELOAD_LOCOMOTION_ACTION_TYPE,
  RELOAD_ASSISTANT_ACTION_TYPE,
  AMMO_TRANSFER_SOURCE_ACTION_TYPE,
  AMMO_TRANSFER_TARGET_ACTION_TYPE,
]);

export interface Stage9ActionReconciliationResultV1 {
  readonly restoredLeaseCount: number;
  readonly removedOrphanCount: number;
  readonly detachedHelperCount: number;
  readonly repairedTransferCopyCount: number;
  readonly clearedAppliedTransferCount: number;
}

export function reconcileStage9PhysicalActions(
  state: SimulationState,
  reconciledSeconds: number,
): Stage9ActionReconciliationResultV1 {
  const units = [...state.units].sort(compareUnits);
  const index = getCombatUnitSpatialIndex(state);
  const expected = new Map<string, Set<string>>();
  let restoredLeaseCount = 0;
  let detachedHelperCount = 0;

  for (const gunner of units) {
    const weapon = gunner.infantryCombatRuntime.primaryWeapon;
    const deployment = weapon?.deployment.activeAction;
    if (weapon && deployment) {
      if (deployment.weaponInstanceId !== weapon.weaponInstanceId) {
        weapon.deployment.activeAction = null;
        weapon.deployment.mode = deployment.kind === 'undeploy' && deployment.anchorBeforeAction ? 'deployed' : 'portable';
      } else {
        const mainType = deployment.kind === 'deploy' ? DEPLOY_WEAPON_ACTION_TYPE : UNDEPLOY_WEAPON_ACTION_TYPE;
        restoredLeaseCount += ensureLease({
          unit: gunner,
          actionType: mainType,
          owner: deployment.owner,
          ownerToken: deployment.ownerToken,
          channels: ['locomotion', 'posture', 'weapon'],
          startedSeconds: deployment.startedSeconds,
          handle: deployment.actionHandle,
          setHandle: (handle) => { deployment.actionHandle = handle; },
          expected,
        });
        const helperValidation = validateMachineGunAssistant(state, gunner, deployment.helperUnitId);
        const helper = helperValidation.valid ? helperValidation.helper : null;
        if (!helper || !deployment.helperActionHandle) {
          if (deployment.helperUnitId || deployment.helperActionHandle) detachedHelperCount += 1;
          deployment.helperUnitId = null;
          deployment.helperActionHandle = null;
          deployment.helperValidationCode = helperValidation.reasonCode;
        } else {
          const restored = ensureLease({
            unit: helper,
            actionType: DEPLOYMENT_ASSISTANT_ACTION_TYPE,
            owner: { source: 'system', id: `${gunner.id}:${DEPLOYMENT_ASSISTANT_ACTION_TYPE}` },
            ownerToken: `${deployment.ownerToken}:assistant:${helper.id}`,
            channels: ['locomotion', 'weapon'],
            startedSeconds: deployment.startedSeconds,
            handle: deployment.helperActionHandle,
            setHandle: (handle) => { deployment.helperActionHandle = handle; },
            expected,
          });
          restoredLeaseCount += restored;
          if (!deployment.helperActionHandle || !getPhysicalActionLease(helper, deployment.helperActionHandle)) {
            deployment.helperUnitId = null;
            deployment.helperActionHandle = null;
            deployment.helperValidationCode = 'assistant_channels_blocked_after_load';
            detachedHelperCount += 1;
          }
        }
      }
    }

    const reload = gunner.infantryCombatRuntime.ammoInventory.activeReload;
    if (reload) {
      if (!weapon || reload.weaponInstanceId !== weapon.weaponInstanceId
        || reload.ammoDefinitionId !== weapon.resolved.ammoDefinitionRef.definitionId) {
        gunner.infantryCombatRuntime.ammoInventory.activeReload = null;
      } else {
        const stage = weapon.resolved.weapon.reloadStages[reload.stageIndex];
        if (!stage) {
          gunner.infantryCombatRuntime.ammoInventory.activeReload = null;
        } else {
          reload.stageId = stage.stageId;
          restoredLeaseCount += ensureLease({
            unit: gunner,
            actionType: RELOAD_WEAPON_ACTION_TYPE,
            owner: reload.owner,
            ownerToken: reload.ownerToken,
            channels: ['weapon'],
            startedSeconds: reload.startedSeconds,
            handle: reload.weaponHandle,
            setHandle: (handle) => { reload.weaponHandle = handle; },
            expected,
          });
          if (reload.locomotionHandle || !stage.movementAllowed) {
            restoredLeaseCount += ensureLease({
              unit: gunner,
              actionType: RELOAD_LOCOMOTION_ACTION_TYPE,
              owner: reload.owner,
              ownerToken: `${reload.ownerToken}:locomotion:${reload.stageIndex}`,
              channels: ['locomotion'],
              startedSeconds: reload.lastAdvancedSeconds,
              handle: reload.locomotionHandle,
              setHandle: (handle) => { reload.locomotionHandle = handle; },
              expected,
            });
          }
          const helperValidation = validateMachineGunAssistant(state, gunner, reload.helperUnitId);
          const helper = helperValidation.valid ? helperValidation.helper : null;
          if (!helper || !reload.helperActionHandle) {
            if (reload.helperUnitId || reload.helperActionHandle) detachedHelperCount += 1;
            reload.helperUnitId = null;
            reload.helperActionHandle = null;
            reload.helperValidationCode = helperValidation.reasonCode;
          } else {
            restoredLeaseCount += ensureLease({
              unit: helper,
              actionType: RELOAD_ASSISTANT_ACTION_TYPE,
              owner: { source: 'system', id: `${gunner.id}:${RELOAD_ASSISTANT_ACTION_TYPE}` },
              ownerToken: `${reload.ownerToken}:assistant:${helper.id}`,
              channels: ['locomotion', 'weapon'],
              startedSeconds: reload.startedSeconds,
              handle: reload.helperActionHandle,
              setHandle: (handle) => { reload.helperActionHandle = handle; },
              expected,
            });
            if (!reload.helperActionHandle || !getPhysicalActionLease(helper, reload.helperActionHandle)) {
              reload.helperUnitId = null;
              reload.helperActionHandle = null;
              reload.helperValidationCode = 'assistant_channels_blocked_after_load';
              detachedHelperCount += 1;
            }
          }
        }
      }
    }
  }

  const transferRepair = reconcileTransferCopies(units, index);
  for (const transfer of transferRepair.activeTransfers) {
    const source = index.unitsById.get(transfer.sourceUnitId);
    const target = index.unitsById.get(transfer.targetUnitId);
    if (!source || !target) continue;
    restoredLeaseCount += ensureLease({
      unit: source,
      actionType: AMMO_TRANSFER_SOURCE_ACTION_TYPE,
      owner: transfer.owner,
      ownerToken: `${transfer.ownerToken}:source`,
      channels: ['locomotion', 'weapon'],
      startedSeconds: transfer.startedSeconds,
      handle: transfer.sourceHandle,
      setHandle: (handle) => setTransferSourceHandle(units, transfer.actionId, handle),
      expected,
    });
    restoredLeaseCount += ensureLease({
      unit: target,
      actionType: AMMO_TRANSFER_TARGET_ACTION_TYPE,
      owner: transfer.owner,
      ownerToken: `${transfer.ownerToken}:target`,
      channels: ['weapon'],
      startedSeconds: transfer.startedSeconds,
      handle: transfer.targetHandle,
      setHandle: (handle) => setTransferTargetHandle(units, transfer.actionId, handle),
      expected,
    });
  }

  let removedOrphanCount = 0;
  for (const unit of units) {
    const expectedIds = expected.get(unit.id) ?? new Set<string>();
    const leases = [...unit.behaviorRuntime.physicalActionCoordinator.activeLeases];
    for (const lease of leases) {
      if (!STAGE9_ACTION_TYPES.has(lease.actionType) || expectedIds.has(lease.handle.actionId)) continue;
      const result = cancelPhysicalActionBySystem(unit, lease.handle.actionId, {
        endedSeconds: reconciledSeconds,
        resultCode: 'stage9_orphan_action_lease_removed',
        resultRu: 'Удалён захват каналов без соответствующего действия Stage 9.',
      });
      if (result.accepted) removedOrphanCount += 1;
    }
  }
  return {
    restoredLeaseCount,
    removedOrphanCount,
    detachedHelperCount,
    repairedTransferCopyCount: transferRepair.repairedCopyCount,
    clearedAppliedTransferCount: transferRepair.clearedAppliedCount,
  };
}

function reconcileTransferCopies(
  units: readonly UnitModel[],
  index: ReturnType<typeof getCombatUnitSpatialIndex>,
): { readonly activeTransfers: AmmoTransferActionV1[]; readonly repairedCopyCount: number; readonly clearedAppliedCount: number } {
  const authoritative = new Map<string, AmmoTransferActionV1>();
  for (const unit of units) {
    const action = unit.infantryCombatRuntime.ammoInventory.activeTransfer;
    if (!action) continue;
    const current = authoritative.get(action.actionId);
    if (!current || action.sourceUnitId === unit.id) authoritative.set(action.actionId, structuredClone(action));
  }
  const activeTransfers: AmmoTransferActionV1[] = [];
  let repairedCopyCount = 0;
  let clearedAppliedCount = 0;
  for (const action of [...authoritative.values()].sort((left, right) => compareText(left.actionId, right.actionId))) {
    const source = index.unitsById.get(action.sourceUnitId);
    const target = index.unitsById.get(action.targetUnitId);
    if (!source || !target || source.id === target.id) {
      clearTransferCopies(units, action.actionId);
      continue;
    }
    const sourceInventory = source.infantryCombatRuntime.ammoInventory;
    const targetInventory = target.infantryCombatRuntime.ammoInventory;
    if (sourceInventory.appliedTransferIds.includes(action.actionId) || targetInventory.appliedTransferIds.includes(action.actionId)) {
      appendBoundedLedger(sourceInventory.appliedTransferIds, action.actionId, MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS);
      appendBoundedLedger(targetInventory.appliedTransferIds, action.actionId, MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS);
      clearTransferCopies(units, action.actionId);
      clearedAppliedCount += 1;
      continue;
    }
    const canonical = structuredClone(action);
    canonical.phase = 'working';
    if (JSON.stringify(sourceInventory.activeTransfer) !== JSON.stringify(canonical)) {
      sourceInventory.activeTransfer = structuredClone(canonical);
      repairedCopyCount += 1;
    }
    if (JSON.stringify(targetInventory.activeTransfer) !== JSON.stringify(canonical)) {
      targetInventory.activeTransfer = structuredClone(canonical);
      repairedCopyCount += 1;
    }
    activeTransfers.push(canonical);
  }
  return { activeTransfers, repairedCopyCount, clearedAppliedCount };
}

function ensureLease(input: {
  readonly unit: UnitModel;
  readonly actionType: string;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly channels: readonly PhysicalActionChannel[];
  readonly startedSeconds: number;
  readonly handle: PhysicalActionHandleV1 | null;
  readonly setHandle: (handle: PhysicalActionHandleV1 | null) => void;
  readonly expected: Map<string, Set<string>>;
}): number {
  const existing = input.handle ? getPhysicalActionLease(input.unit, input.handle) : null;
  if (existing) {
    markExpected(input.expected, input.unit.id, existing.handle.actionId);
    return 0;
  }
  const request = requestPhysicalActionChannels(input.unit, {
    actionType: input.actionType,
    owner: input.owner,
    ownerToken: input.ownerToken,
    channels: input.channels,
    startedSeconds: input.startedSeconds,
    reasonCode: 'stage9_action_lease_restored',
    reasonRu: 'Восстановлен захват каналов физического действия Stage 9.',
  });
  if (!request.accepted || !request.handle) {
    input.setHandle(null);
    return 0;
  }
  input.setHandle(request.handle);
  markExpected(input.expected, input.unit.id, request.handle.actionId);
  return 1;
}

function setTransferSourceHandle(
  units: readonly UnitModel[],
  actionId: string,
  handle: PhysicalActionHandleV1 | null,
): void {
  for (const unit of units) {
    const action = unit.infantryCombatRuntime.ammoInventory.activeTransfer;
    if (action?.actionId === actionId) action.sourceHandle = handle;
  }
}
function setTransferTargetHandle(
  units: readonly UnitModel[],
  actionId: string,
  handle: PhysicalActionHandleV1 | null,
): void {
  for (const unit of units) {
    const action = unit.infantryCombatRuntime.ammoInventory.activeTransfer;
    if (action?.actionId === actionId) action.targetHandle = handle;
  }
}
function clearTransferCopies(units: readonly UnitModel[], actionId: string): void {
  for (const unit of units) {
    const inventory = unit.infantryCombatRuntime.ammoInventory;
    if (inventory.activeTransfer?.actionId === actionId) inventory.activeTransfer = null;
  }
}
function markExpected(expected: Map<string, Set<string>>, unitId: string, actionId: string): void {
  const ids = expected.get(unitId) ?? new Set<string>();
  ids.add(actionId);
  expected.set(unitId, ids);
}
function compareUnits(left: UnitModel, right: UnitModel): number { return left.id < right.id ? -1 : left.id > right.id ? 1 : 0; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
