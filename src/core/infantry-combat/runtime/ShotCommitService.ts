import type { UnitModel } from '../../units/UnitModel';
import { getSuppressionSupportPoint } from './AutomaticFireSupportPoints';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import {
  beginAmmoExhaustedRecovery,
  beginCompletedBurstRecovery,
} from './FireTaskRuntime';
import { withFireTaskTestShotRandomness } from './FireTaskTestOverrides';
import type { ShotCommitStatus } from './InfantryCombatRuntimeTypes';
import {
  commitShot as commitBaseShot,
  type CommitShotInput,
  type CommitShotResult,
} from './ShotCommitServiceStage8';
import { isTargetWithinDeployedTraverse } from './WeaponDeploymentRuntime';

export * from './ShotCommitServiceStage8';

export function commitShot(input: CommitShotInput): CommitShotResult {
  const replayOrdinal = resolveCommittedReplayOrdinal(input);
  if (replayOrdinal !== null) {
    return commitBaseShot({ ...input, shotOrdinal: replayOrdinal });
  }
  if (!getEffectiveCombatCapabilities(input.shooter).canUseWeapon) {
    return recordFailure(input.shooter, input.weapon.roundsInWeapon, 'weapon_capability_lost', 'Выстрел отклонён: физическое состояние не позволяет пользоваться оружием.');
  }
  if (input.weapon.deployment.activeAction || input.shooter.infantryCombatRuntime.ammoInventory.activeReload || input.shooter.infantryCombatRuntime.ammoInventory.activeTransfer) {
    return recordFailure(input.shooter, input.weapon.roundsInWeapon, 'weapon_action_in_progress', 'Выстрел отклонён: выполняется другое физическое действие оружия.');
  }
  const ordinal = input.shotOrdinal ?? input.task.nextShotOrdinal;
  const diagnosticTarget = input.task.mode === 'suppress'
    ? getSuppressionSupportPoint(
        input.task.taskId,
        ordinal,
        input.task.plannedRoundCount,
        input.task.aimTracking.solution.predictedAimPoint ?? input.task.target,
        input.task.targetRadiusMetres,
      )
    : input.task.aimTracking.solution.predictedAimPoint ?? input.task.target;
  if (!isTargetWithinDeployedTraverse(input.weapon, diagnosticTarget)) {
    return recordFailure(input.shooter, input.weapon.roundsInWeapon, 'deployed_traverse_exceeded', 'Выстрел отклонён: фактическое направление вышло за сектор установленного пулемёта.');
  }
  const nextShotId = `${input.shooter.id}:shot:${input.weapon.shotSequence + 1}`;
  const result = withFireTaskTestShotRandomness(
    input.task,
    input.shooter.id,
    input.weapon.weaponInstanceId,
    nextShotId,
    () => commitBaseShot(input),
  );
  if (result.status === 'committed') {
    const task = input.shooter.infantryCombatRuntime.activeFireTask;
    if (task === input.task && task.phase === 'firing') {
      if (task.nextShotOrdinal >= task.plannedRoundCount) {
        beginCompletedBurstRecovery(input.shooter, input.committedSeconds);
      } else if (input.weapon.roundsInWeapon <= 0) {
        beginAmmoExhaustedRecovery(input.shooter, input.committedSeconds);
      }
    }
  }
  return result;
}

function resolveCommittedReplayOrdinal(input: CommitShotInput): number | null {
  if (input.shotOrdinal !== undefined) {
    return input.task.committedShots.some((record) => record.ordinal === input.shotOrdinal)
      ? input.shotOrdinal
      : null;
  }
  if (input.task.phase === 'firing') return null;
  return input.task.committedShots.at(-1)?.ordinal ?? null;
}

function recordFailure(shooter: UnitModel, rounds: number, status: Extract<ShotCommitStatus, 'weapon_capability_lost' | 'weapon_action_in_progress' | 'deployed_traverse_exceeded'>, reasonRu: string): CommitShotResult {
  const result: CommitShotResult = {
    status,
    reasonRu,
    shotId: null,
    projectileId: null,
    muzzlePosition: null,
    muzzleBlocked: false,
    friendlyRisk: 0,
    roundsBefore: rounds,
    roundsAfter: rounds,
    aimDirectionBeforeDispersion: null,
    dispersionPitchRadians: 0,
    dispersionYawRadians: 0,
    recoilPitchRadians: 0,
    recoilYawRadians: 0,
    finalProjectileDirection: null,
  };
  shooter.infantryCombatRuntime.lastShotCommit = {
    status: result.status,
    reasonRu: result.reasonRu,
    muzzlePosition: result.muzzlePosition,
    muzzleBlocked: result.muzzleBlocked,
    friendlyRisk: result.friendlyRisk,
    roundsBefore: result.roundsBefore,
    roundsAfter: result.roundsAfter,
    shotId: result.shotId,
    projectileId: result.projectileId,
    aimDirectionBeforeDispersion: result.aimDirectionBeforeDispersion,
    dispersionPitchRadians: result.dispersionPitchRadians,
    dispersionYawRadians: result.dispersionYawRadians,
    recoilPitchRadians: result.recoilPitchRadians,
    recoilYawRadians: result.recoilYawRadians,
    finalProjectileDirection: result.finalProjectileDirection,
  };
  return result;
}
