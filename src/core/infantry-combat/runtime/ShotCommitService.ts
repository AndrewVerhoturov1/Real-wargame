import type { UnitModel } from '../../units/UnitModel';
import {
  commitShot as commitBaseShot,
  type CommitShotInput,
  type CommitShotResult,
} from './ShotCommitServiceStage5';

export * from './ShotCommitServiceStage5';

export function commitShot(input: CommitShotInput): CommitShotResult {
  if (!input.shooter.infantryCombatRuntime.wounds.capabilities.canUseWeapon) {
    return recordWeaponCapabilityFailure(input.shooter, input.weapon.roundsInWeapon);
  }
  return commitBaseShot(input);
}

function recordWeaponCapabilityFailure(shooter: UnitModel, rounds: number): CommitShotResult {
  const result: CommitShotResult = {
    status: 'weapon_capability_lost',
    reasonRu: 'Одиночный выстрел отклонён: ранение не позволяет пользоваться оружием.',
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
