import type { UnitModel } from '../../units/UnitModel';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import {
  beginAmmoExhaustedRecovery,
  beginCompletedBurstRecovery,
} from './FireTaskRuntime';
import {
  commitShot as commitBaseShot,
  type CommitShotInput,
  type CommitShotResult,
} from './ShotCommitServiceStage8';

export * from './ShotCommitServiceStage8';

export function commitShot(input: CommitShotInput): CommitShotResult {
  if (!getEffectiveCombatCapabilities(input.shooter).canUseWeapon) {
    return recordWeaponCapabilityFailure(input.shooter, input.weapon.roundsInWeapon);
  }
  const result = commitBaseShot(input);
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

function recordWeaponCapabilityFailure(shooter: UnitModel, rounds: number): CommitShotResult {
  const result: CommitShotResult = {
    status: 'weapon_capability_lost',
    reasonRu: 'Выстрел отклонён: физическое состояние не позволяет пользоваться оружием.',
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
