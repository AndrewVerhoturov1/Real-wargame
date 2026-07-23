import type { BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import { beginFireTaskRecovery, fireTaskHasExactLease } from './FireTaskRuntime';
import { evaluateCenterlineFriendlyFireRisk, evaluateMuzzleBlocked } from './FriendlyFireRisk';
import { computeMuzzleGeometry } from './MuzzleGeometry';
import {
  MAX_STAGE3_ACTIVE_PROJECTILES,
  PROJECTILE_STATE_SCHEMA_VERSION,
  SHOT_COMMIT_RECORD_SCHEMA_VERSION,
  type ProjectileStateV1,
  type ShotCommitRecordV1,
} from './ProjectileRuntimeTypes';
import { appendBoundedCommitRecord } from './ReferenceProjectileRuntime';
import type {
  FireTaskRuntimeV1,
  InfantryWeaponInstanceV1,
  ShotCommitDiagnosticV1,
  ShotCommitStatus,
} from './InfantryCombatRuntimeTypes';

export interface CommitShotInput {
  readonly state: SimulationState;
  readonly shooter: UnitModel;
  readonly task: FireTaskRuntimeV1;
  readonly weapon: InfantryWeaponInstanceV1;
  readonly committedSeconds: number;
}

export interface CommitShotResult {
  readonly status: ShotCommitStatus;
  readonly shotId: string | null;
  readonly projectileId: string | null;
  readonly muzzlePosition: BallisticPoint3 | null;
  readonly muzzleBlocked: boolean;
  readonly friendlyRisk: number;
  readonly roundsBefore: number | null;
  readonly roundsAfter: number | null;
}

export function commitShot(input: CommitShotInput): CommitShotResult {
  const { state, shooter, task, weapon } = input;
  if (task.committedShotId) {
    return recordResult(shooter, {
      status: 'already_committed',
      shotId: task.committedShotId,
      projectileId: `${task.committedShotId}:projectile`,
      muzzlePosition: null,
      muzzleBlocked: false,
      friendlyRisk: 0,
      roundsBefore: weapon.roundsInWeapon,
      roundsAfter: weapon.roundsInWeapon,
    });
  }
  if (shooter.infantryCombatRuntime.activeFireTask !== task || task.phase !== 'firing') {
    return failure(shooter, 'task_not_firing');
  }
  if (!fireTaskHasExactLease(shooter, task)) {
    return failure(shooter, 'ownership_lost');
  }
  if (shooter.infantryCombatRuntime.primaryWeapon !== weapon) {
    return failure(shooter, 'weapon_missing');
  }
  if (task.mode !== 'single') {
    return failure(shooter, 'unsupported_mode');
  }
  if (!isFinitePoint(task.target)) {
    return failure(shooter, 'invalid_target');
  }
  if (weapon.roundsInWeapon <= 0) {
    return failure(shooter, 'empty_weapon', { roundsBefore: weapon.roundsInWeapon, roundsAfter: weapon.roundsInWeapon });
  }
  const geometry = computeMuzzleGeometry(state.map, shooter, task.target, weapon);
  if (!geometry) return failure(shooter, 'invalid_target');
  const muzzleCheck = evaluateMuzzleBlocked(state, shooter, geometry);
  if (muzzleCheck.blocked) {
    return failure(shooter, 'muzzle_blocked', {
      muzzlePosition: geometry.muzzle,
      muzzleBlocked: true,
      roundsBefore: weapon.roundsInWeapon,
      roundsAfter: weapon.roundsInWeapon,
    });
  }
  const friendly = evaluateCenterlineFriendlyFireRisk(state, shooter, geometry.muzzle, geometry.target);
  if (friendly.risk > task.maximumFriendlyFireRisk) {
    return failure(shooter, 'friendly_risk_exceeded', {
      muzzlePosition: geometry.muzzle,
      friendlyRisk: friendly.risk,
      roundsBefore: weapon.roundsInWeapon,
      roundsAfter: weapon.roundsInWeapon,
    });
  }
  const projectileRuntime = state.infantryCombatProjectiles;
  if (projectileRuntime.activeProjectiles.length >= MAX_STAGE3_ACTIVE_PROJECTILES) {
    projectileRuntime.diagnostics.capRejectionCount = Math.min(Number.MAX_SAFE_INTEGER, projectileRuntime.diagnostics.capRejectionCount + 1);
    return failure(shooter, 'projectile_capacity_exceeded', {
      muzzlePosition: geometry.muzzle,
      friendlyRisk: friendly.risk,
      roundsBefore: weapon.roundsInWeapon,
      roundsAfter: weapon.roundsInWeapon,
    });
  }

  const nextShotSequence = weapon.shotSequence + 1;
  if (!Number.isSafeInteger(nextShotSequence) || nextShotSequence <= 0) return failure(shooter, 'projectile_capacity_exceeded');
  const shotId = `${shooter.id}:shot:${nextShotSequence}`;
  const projectileId = `${shotId}:projectile`;
  const speed = weapon.resolved.ammo.muzzleVelocityMetersPerSecond;
  const initialVelocity = {
    x: geometry.weaponDirection.x * speed,
    y: geometry.weaponDirection.y * speed,
    z: geometry.weaponDirection.z * speed,
  };
  const projectileCandidate: ProjectileStateV1 = {
    schemaVersion: PROJECTILE_STATE_SCHEMA_VERSION,
    projectileId,
    shotId,
    shooterId: shooter.id,
    ammoSnapshot: structuredClone(weapon.resolved.ammo),
    position: { ...geometry.muzzle },
    velocityMetresPerSecond: initialVelocity,
    ageSeconds: 0,
    maximumLifetimeSeconds: weapon.resolved.ammo.maximumLifetimeSeconds,
    bodyPenetrationBudget: weapon.resolved.ammo.bodyPenetrationBudget,
    impactSequence: 0,
  };
  const roundsBefore = weapon.roundsInWeapon;
  const roundsAfter = roundsBefore - 1;
  const commitRecord: ShotCommitRecordV1 = {
    schemaVersion: SHOT_COMMIT_RECORD_SCHEMA_VERSION,
    shotId,
    shooterId: shooter.id,
    fireTaskId: task.taskId,
    weaponInstanceId: weapon.weaponInstanceId,
    weaponDefinitionRef: { ...weapon.resolved.weaponDefinitionRef },
    ammoDefinitionRef: { ...weapon.resolved.ammoDefinitionRef },
    committedSimulationSeconds: finiteNonNegative(input.committedSeconds, state.simulationTimeSeconds),
    muzzlePosition: { ...geometry.muzzle },
    initialVelocityMetresPerSecond: { ...initialVelocity },
    roundsBefore,
    roundsAfter,
  };
  const activeShotIds = new Set(projectileRuntime.activeProjectiles.map((projectile) => projectile.shotId));
  activeShotIds.add(shotId);
  const nextLedger = appendBoundedCommitRecord(projectileRuntime, commitRecord, activeShotIds);
  const nextProjectiles = [...projectileRuntime.activeProjectiles, projectileCandidate].sort((left, right) => compareText(left.projectileId, right.projectileId));

  weapon.shotSequence = nextShotSequence;
  weapon.roundsInWeapon = roundsAfter;
  weapon.lastCommittedShotId = shotId;
  task.committedShotId = shotId;
  projectileRuntime.committedShots = nextLedger;
  projectileRuntime.activeProjectiles = nextProjectiles;
  beginFireTaskRecovery(shooter, {
    committedShotId: shotId,
    startedSeconds: commitRecord.committedSimulationSeconds,
  });
  return recordResult(shooter, {
    status: 'committed',
    shotId,
    projectileId,
    muzzlePosition: geometry.muzzle,
    muzzleBlocked: false,
    friendlyRisk: friendly.risk,
    roundsBefore,
    roundsAfter,
  });
}

function failure(
  shooter: UnitModel,
  status: Exclude<ShotCommitStatus, 'committed' | 'already_committed'>,
  overrides: Partial<Omit<CommitShotResult, 'status' | 'shotId' | 'projectileId'>> = {},
): CommitShotResult {
  return recordResult(shooter, {
    status,
    shotId: null,
    projectileId: null,
    muzzlePosition: overrides.muzzlePosition ?? null,
    muzzleBlocked: overrides.muzzleBlocked ?? false,
    friendlyRisk: overrides.friendlyRisk ?? 0,
    roundsBefore: overrides.roundsBefore ?? null,
    roundsAfter: overrides.roundsAfter ?? null,
  });
}

function recordResult(shooter: UnitModel, result: CommitShotResult): CommitShotResult {
  const diagnostic: ShotCommitDiagnosticV1 = {
    status: result.status,
    muzzlePosition: result.muzzlePosition ? { ...result.muzzlePosition } : null,
    muzzleBlocked: result.muzzleBlocked,
    friendlyRisk: result.friendlyRisk,
    roundsBefore: result.roundsBefore,
    roundsAfter: result.roundsAfter,
    shotId: result.shotId,
    projectileId: result.projectileId,
  };
  shooter.infantryCombatRuntime.lastShotCommit = diagnostic;
  return result;
}

function isFinitePoint(point: BallisticPoint3): boolean {
  return Number.isFinite(point.xMetres) && Number.isFinite(point.yMetres) && Number.isFinite(point.zMetres);
}

function finiteNonNegative(value: unknown, fallback: number): number {
  const numeric = Math.max(0, typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  return Math.round(numeric * 1_000_000_000_000) / 1_000_000_000_000;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
