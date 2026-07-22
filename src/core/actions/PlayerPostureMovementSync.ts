import { publishTacticalOrderIntentToAiMemory } from '../ai/TacticalOrderBlackboard';
import {
  movementGaitForPosture,
  movementProfileIdForPosture,
} from '../movement/PostureMovementProfile';
import { withTacticalOrderMovementProfile } from '../orders/TacticalOrderIntent';
import type { UnitModel } from '../units/UnitModel';
import { getRunningPostureTransition } from './PostureTransition';

/**
 * A manual posture command issued during an active route changes both the
 * physical posture action and the movement authority. Without this bridge the
 * route keeps its old posture-owned profile and requests the starting posture
 * again as soon as the manual transition completes.
 */
export function reconcilePlayerPostureMovementAuthority(unit: UnitModel): boolean {
  const action = getRunningPostureTransition(unit);
  const order = unit.order;
  if (!action || action.owner.source !== 'player' || !order) return false;

  const targetPosture = action.targetPosture;
  const profileId = movementProfileIdForPosture(targetPosture);
  const gait = movementGaitForPosture(targetPosture);
  const command = unit.playerCommand;
  let commandRevision: number | null = null;
  let changed = false;

  if (
    command
    && (command.status === 'active' || command.status === 'blocked')
    && (!order.playerCommandId || order.playerCommandId === command.id)
  ) {
    const approachPosture = command.tacticalPositionOccupationStatus === 'approaching'
      ? targetPosture
      : command.approachPosture;
    const commandChanged = command.intent.movementProfileId !== profileId
      || command.movementProfileId !== profileId
      || command.approachPosture !== approachPosture;

    if (commandChanged) {
      const intent = withTacticalOrderMovementProfile(command.intent, profileId);
      const nextCommand = {
        ...command,
        target: { ...command.target },
        intent,
        movementProfileId: profileId,
        approachPosture,
        revision: command.revision + 1,
        reason: 'Player changed posture during active movement.',
        reasonRu: 'Игрок изменил позу во время движения.',
      };
      unit.playerCommand = nextCommand;
      commandRevision = nextCommand.revision;
      publishTacticalOrderIntentToAiMemory(unit, nextCommand.intent);
      changed = true;
    } else {
      commandRevision = command.revision;
    }
  }

  const runtimeChanged = unit.movementRuntime.requestedProfileId !== profileId
    || unit.movementRuntime.effectiveProfileId !== profileId
    || unit.movementRuntime.requestedProfileSource !== 'player_order'
    || unit.movementRuntime.effectiveProfileSource !== 'player_order'
    || unit.movementRuntime.requestedGait !== gait;
  const orderChanged = order.movementProfileId !== profileId
    || order.movementProfileSource !== 'player_order';

  if (runtimeChanged || orderChanged) {
    const nextRevision = Math.max(
      1,
      commandRevision ?? 0,
      unit.movementRuntime.profileSelectionRevision + 1,
      (order.movementProfileSelectionRevision ?? 0) + 1,
    );
    unit.movementRuntime.requestedProfileId = profileId;
    unit.movementRuntime.effectiveProfileId = profileId;
    unit.movementRuntime.requestedProfileSource = 'player_order';
    unit.movementRuntime.effectiveProfileSource = 'player_order';
    unit.movementRuntime.requestedGait = gait;
    unit.movementRuntime.profileSelectionRevision = nextRevision;
    unit.movementRuntime.forcedFallbackReason = null;
    unit.movementRuntime.migrationInfo = null;

    order.movementProfileId = profileId;
    order.movementProfileSource = 'player_order';
    order.movementProfileOwnerToken = unit.playerCommand?.id ?? order.movementProfileOwnerToken ?? action.ownerToken;
    order.movementProfileSelectionRevision = nextRevision;
    changed = true;
  }

  if (changed) {
    unit.behaviorRuntime.lastEvent = 'player_posture_movement_authority_updated';
  }
  return changed;
}
