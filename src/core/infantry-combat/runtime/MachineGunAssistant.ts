import { getPhysicalActionLease, requestPhysicalActionChannels } from '../../actions/PhysicalActionCoordinator';
import type { PhysicalActionChannel, PhysicalActionHandleV1 } from '../../actions/PhysicalActionCoordinatorTypes';
import { getCombatUnitSpatialIndex } from '../../combat/CombatUnitSpatialIndex';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';

export const MACHINE_GUN_ASSISTANT_MAX_DISTANCE_METRES = 1.5;

export type MachineGunAssistantReasonCode =
  | 'assistant_not_requested'
  | 'assistant_missing'
  | 'assistant_same_unit'
  | 'assistant_side_invalid'
  | 'assistant_target_role_invalid'
  | 'assistant_role_invalid'
  | 'assistant_out_of_range'
  | 'assistant_capability_lost'
  | 'assistant_channels_blocked'
  | 'assistant_valid';

export interface MachineGunAssistantValidationV1 {
  readonly valid: boolean;
  readonly helper: UnitModel | null;
  readonly reasonCode: MachineGunAssistantReasonCode;
  readonly reasonRu: string;
}

export function validateMachineGunAssistant(
  state: SimulationState,
  gunner: UnitModel,
  helperUnitId: string | null,
): MachineGunAssistantValidationV1 {
  if (!helperUnitId) return invalid('assistant_not_requested', 'Помощник не указан.');
  const helper = getCombatUnitSpatialIndex(state).unitsById.get(helperUnitId) ?? null;
  if (!helper) return invalid('assistant_missing', 'Указанный помощник не найден.');
  if (helper === gunner || helper.id === gunner.id) return invalid('assistant_same_unit', 'Боец не может помогать сам себе.');
  if (helper.side !== gunner.side) return invalid('assistant_side_invalid', 'Помощник должен быть на той же стороне.');
  if (gunner.infantryCombatRuntime.ammoInventory.role !== 'machine_gunner') {
    return invalid('assistant_target_role_invalid', 'Получатель помощи не является пулемётчиком.');
  }
  if (helper.infantryCombatRuntime.ammoInventory.role !== 'assistant_machine_gunner') {
    return invalid('assistant_role_invalid', 'Указанный боец не является помощником пулемётчика.');
  }
  const distance = Math.hypot(
    helper.position.x - gunner.position.x,
    helper.position.y - gunner.position.y,
  ) * state.map.metersPerCell;
  if (distance > MACHINE_GUN_ASSISTANT_MAX_DISTANCE_METRES + 1e-9) {
    return invalid('assistant_out_of_range', 'Помощник находится слишком далеко.');
  }
  const capabilities = getEffectiveCombatCapabilities(helper);
  if (!capabilities.alive || !capabilities.conscious || !capabilities.canMove || !capabilities.canUseHands) {
    return invalid('assistant_capability_lost', 'Физическое состояние помощника не позволяет помогать.');
  }
  return { valid: true, helper, reasonCode: 'assistant_valid', reasonRu: 'Помощник доступен.' };
}

export function requestAssistantLease(input: {
  readonly state: SimulationState;
  readonly gunner: UnitModel;
  readonly helperUnitId: string | null;
  readonly actionType: string;
  readonly ownerToken: string;
  readonly channels: readonly PhysicalActionChannel[];
  readonly startedSeconds: number;
}): { readonly validation: MachineGunAssistantValidationV1; readonly handle: PhysicalActionHandleV1 | null } {
  const validation = validateMachineGunAssistant(input.state, input.gunner, input.helperUnitId);
  if (!validation.valid || !validation.helper) return { validation, handle: null };
  const lease = requestPhysicalActionChannels(validation.helper, {
    actionType: input.actionType,
    owner: { source: 'system', id: `${input.gunner.id}:${input.actionType}` },
    ownerToken: `${input.ownerToken}:assistant:${validation.helper.id}`,
    channels: input.channels,
    startedSeconds: input.startedSeconds,
    reasonCode: 'machine_gun_assistant_requested',
    reasonRu: 'Помощник участвует в физическом действии пулемётчика.',
  });
  if (!lease.accepted || !lease.handle) {
    return { validation: invalid('assistant_channels_blocked', 'Физические каналы помощника заняты.'), handle: null };
  }
  return { validation, handle: lease.handle };
}

export function assistantLeaseStillValid(
  state: SimulationState,
  gunner: UnitModel,
  helperUnitId: string | null,
  helperHandle: PhysicalActionHandleV1 | null,
): boolean {
  const validation = validateMachineGunAssistant(state, gunner, helperUnitId);
  return Boolean(validation.valid && validation.helper && helperHandle && getPhysicalActionLease(validation.helper, helperHandle));
}

function invalid(
  reasonCode: Exclude<MachineGunAssistantReasonCode, 'assistant_valid'>,
  reasonRu: string,
): MachineGunAssistantValidationV1 {
  return { valid: false, helper: null, reasonCode, reasonRu };
}
