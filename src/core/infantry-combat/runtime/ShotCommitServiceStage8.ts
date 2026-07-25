import { normalizeDirection, type BallisticDirection3, type BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  applySuccessfulShotRecoil,
  deriveSeededAngularOffsets,
  getRecoveredWeaponRecoil,
  prepareCommittedShotDirection,
  resolveProductionAimFactors,
} from './AimRuntime';
import {
  automaticFireCadenceAllowsShot,
  prepareAutomaticFireCommit,
} from './AutomaticFireRuntime';
import { getSuppressionSupportPoint } from './AutomaticFireSupportPoints';
import { fireTaskHasExactLease, recordCommittedFireTaskShot } from './FireTaskRuntime';
import { evaluateFriendlyFireCorridorRisk, evaluateMuzzleBlocked } from './FriendlyFireRisk';
import { computeMuzzleGeometryFromDirection, getWeaponAnchor } from './MuzzleGeometry';
import {
  PROJECTILE_STATE_SCHEMA_VERSION,
  SHOT_COMMIT_RECORD_SCHEMA_VERSION,
  type ProjectileStateV1,
  type ShotCommitRecordV1,
} from './ProjectileRuntimeTypes';
import {
  appendBoundedCommitRecord,
  getActiveShotIds,
  trySpawnProjectile,
} from './ProjectileRuntime';
import type {
  FireTaskRuntimeV1,
  InfantryWeaponInstanceV1,
  ShotCommitDiagnosticV1,
  ShotCommitStatus,
} from './InfantryCombatRuntimeTypes';

const QUALITY_EPSILON = 1e-9;

export interface CommitShotInput {
  readonly state: SimulationState;
  readonly shooter: UnitModel;
  readonly task: FireTaskRuntimeV1;
  readonly weapon: InfantryWeaponInstanceV1;
  readonly committedSeconds: number;
  readonly shotOrdinal?: number;
}

export interface CommitShotResult {
  readonly status: ShotCommitStatus;
  readonly reasonRu: string;
  readonly shotId: string | null;
  readonly projectileId: string | null;
  readonly muzzlePosition: BallisticPoint3 | null;
  readonly muzzleBlocked: boolean;
  readonly friendlyRisk: number;
  readonly roundsBefore: number | null;
  readonly roundsAfter: number | null;
  readonly aimDirectionBeforeDispersion: BallisticDirection3 | null;
  readonly dispersionPitchRadians: number;
  readonly dispersionYawRadians: number;
  readonly recoilPitchRadians: number;
  readonly recoilYawRadians: number;
  readonly finalProjectileDirection: BallisticDirection3 | null;
}

export function commitShot(input: CommitShotInput): CommitShotResult {
  const { state, shooter, task, weapon } = input;
  const ordinal = input.shotOrdinal ?? task.nextShotOrdinal;
  const existingTaskRecord = task.committedShots.find((record) => record.ordinal === ordinal) ?? null;
  if (existingTaskRecord) {
    const existing = state.infantryCombatProjectiles.committedShots.find((record) => record.shotId === existingTaskRecord.shotId) ?? null;
    return recordResult(shooter, {
      status: 'already_committed',
      reasonRu: 'Этот порядковый номер очереди уже был зафиксирован; повторное применение не выполнено.',
      shotId: existingTaskRecord.shotId,
      projectileId: existingTaskRecord.projectileId,
      muzzlePosition: existing?.muzzlePosition ?? null,
      muzzleBlocked: false,
      friendlyRisk: 0,
      roundsBefore: weapon.roundsInWeapon,
      roundsAfter: weapon.roundsInWeapon,
      aimDirectionBeforeDispersion: existing?.aimDirectionBeforeDispersion ?? null,
      dispersionPitchRadians: existing?.dispersionPitchRadians ?? 0,
      dispersionYawRadians: existing?.dispersionYawRadians ?? 0,
      recoilPitchRadians: existing?.recoilPitchRadians ?? 0,
      recoilYawRadians: existing?.recoilYawRadians ?? 0,
      finalProjectileDirection: existing?.finalProjectileDirection ?? null,
    });
  }
  if (shooter.infantryCombatRuntime.activeFireTask !== task || task.phase !== 'firing') return failure(shooter, 'task_not_firing');
  if (!fireTaskHasExactLease(shooter, task)) return failure(shooter, 'ownership_lost');
  if (shooter.infantryCombatRuntime.primaryWeapon !== weapon) return failure(shooter, 'weapon_missing');
  if (!weapon.resolved.weapon.availableFireModes.includes(task.mode)) return failure(shooter, 'unsupported_mode');
  if (ordinal !== task.nextShotOrdinal || ordinal < 0 || ordinal >= task.plannedRoundCount) return failure(shooter, 'ordinal_mismatch');

  const committedSimulationSeconds = finiteNonNegative(input.committedSeconds, state.simulationTimeSeconds);
  if (!automaticFireCadenceAllowsShot(weapon.automaticFire, committedSimulationSeconds)) {
    return failure(shooter, 'cadence_wait', { roundsBefore: weapon.roundsInWeapon, roundsAfter: weapon.roundsInWeapon });
  }
  const preparedCadence = prepareAutomaticFireCommit(
    weapon.automaticFire,
    weapon.resolved.weapon,
    committedSimulationSeconds,
  );
  if (!preparedCadence) return failure(shooter, 'unsupported_mode');

  const solution = task.aimTracking.solution;
  if (!solution.valid || !isFiniteDirection(solution.currentDirection)) return failure(shooter, 'aim_solution_invalid');
  if (solution.usableAimQuality + QUALITY_EPSILON < task.minimumSolutionQuality) return failure(shooter, 'aim_solution_below_threshold');
  if (shooter.movementRuntime.isMoving && weapon.resolved.weapon.allowFireWhileMoving === false) {
    return failure(shooter, 'movement_forbidden', { roundsBefore: weapon.roundsInWeapon, roundsAfter: weapon.roundsInWeapon });
  }
  if (weapon.roundsInWeapon <= 0) {
    return failure(shooter, 'empty_weapon', { roundsBefore: weapon.roundsInWeapon, roundsAfter: weapon.roundsInWeapon });
  }

  const nextShotSequence = weapon.shotSequence + 1;
  if (!Number.isSafeInteger(nextShotSequence) || nextShotSequence <= 0) return failure(shooter, 'projectile_capacity_exceeded');
  const shotId = `${shooter.id}:shot:${nextShotSequence}`;
  const projectileId = `${shotId}:projectile`;
  const factors = resolveProductionAimFactors(state, shooter, weapon);
  const recoil = getRecoveredWeaponRecoil(weapon, committedSimulationSeconds, factors);
  const supportPoint = task.mode === 'suppress'
    ? getSuppressionSupportPoint(
        task.taskId,
        ordinal,
        task.plannedRoundCount,
        solution.predictedAimPoint ?? task.target,
        task.targetRadiusMetres,
      )
    : null;
  const aimDirectionBeforeDispersion = supportPoint
    ? directionBetween(getWeaponAnchor(state.map, shooter), supportPoint)
    : normalizeFiniteDirection(solution.currentDirection);
  if (!aimDirectionBeforeDispersion) return failure(shooter, 'invalid_target');
  const dispersion = deriveSeededAngularOffsets({
    shooterId: shooter.id,
    weaponInstanceId: weapon.weaponInstanceId,
    shotId,
    effectiveDispersionRadians: solution.effectiveDispersionRadians,
  });
  const corridorCenterDirection = prepareCommittedShotDirection({
    aimDirection: aimDirectionBeforeDispersion,
    recoilPitchRadians: recoil.pitchOffsetRadians,
    recoilYawRadians: recoil.yawOffsetRadians,
    dispersionPitchRadians: 0,
    dispersionYawRadians: 0,
  });
  const finalProjectileDirection = prepareCommittedShotDirection({
    aimDirection: aimDirectionBeforeDispersion,
    recoilPitchRadians: recoil.pitchOffsetRadians,
    recoilYawRadians: recoil.yawOffsetRadians,
    dispersionPitchRadians: dispersion.pitchRadians,
    dispersionYawRadians: dispersion.yawRadians,
  });
  const diagnosticTarget = supportPoint ?? solution.predictedAimPoint ?? task.target;
  const geometry = computeMuzzleGeometryFromDirection(state.map, shooter, finalProjectileDirection, weapon, diagnosticTarget);
  if (!geometry) return failure(shooter, 'invalid_target');
  const muzzleCheck = evaluateMuzzleBlocked(state, shooter, geometry);
  if (muzzleCheck.blocked) {
    return failure(shooter, 'muzzle_blocked', {
      muzzlePosition: geometry.muzzle,
      muzzleBlocked: true,
      roundsBefore: weapon.roundsInWeapon,
      roundsAfter: weapon.roundsInWeapon,
      aimDirectionBeforeDispersion,
      dispersionPitchRadians: dispersion.pitchRadians,
      dispersionYawRadians: dispersion.yawRadians,
      recoilPitchRadians: recoil.pitchOffsetRadians,
      recoilYawRadians: recoil.yawOffsetRadians,
      finalProjectileDirection,
    });
  }
  const corridorDistance = distanceToPoint(geometry.muzzle, diagnosticTarget);
  const friendly = evaluateFriendlyFireCorridorRisk(
    state,
    shooter,
    geometry.muzzle,
    corridorCenterDirection,
    corridorDistance,
    solution.effectiveDispersionRadians,
  );
  if (friendly.risk > task.maximumFriendlyFireRisk) {
    return failure(shooter, 'friendly_risk_exceeded', {
      muzzlePosition: geometry.muzzle,
      friendlyRisk: friendly.risk,
      roundsBefore: weapon.roundsInWeapon,
      roundsAfter: weapon.roundsInWeapon,
      aimDirectionBeforeDispersion,
      dispersionPitchRadians: dispersion.pitchRadians,
      dispersionYawRadians: dispersion.yawRadians,
      recoilPitchRadians: recoil.pitchOffsetRadians,
      recoilYawRadians: recoil.yawOffsetRadians,
      finalProjectileDirection,
    });
  }

  const speed = weapon.resolved.ammo.muzzleVelocityMetersPerSecond;
  const initialVelocity = {
    x: finalProjectileDirection.x * speed,
    y: finalProjectileDirection.y * speed,
    z: finalProjectileDirection.z * speed,
  };
  const suppressionContinuousFireScore = preparedCadence.next.continuousFireScore;
  const projectileCandidate: ProjectileStateV1 = {
    schemaVersion: PROJECTILE_STATE_SCHEMA_VERSION,
    projectileId,
    shotId,
    shooterId: shooter.id,
    ammoSnapshot: weapon.resolved.ammo,
    position: { ...geometry.muzzle },
    velocityMetresPerSecond: initialVelocity,
    ageSeconds: 0,
    maximumLifetimeSeconds: weapon.resolved.ammo.maximumLifetimeSeconds,
    bodyPenetrationBudget: weapon.resolved.ammo.bodyPenetrationBudget,
    bodyPenetrationCount: 0,
    impactSequence: 0,
    lastHitUnitId: null,
    suppressionContinuousFireScore,
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
    committedSimulationSeconds,
    muzzlePosition: { ...geometry.muzzle },
    aimDirectionBeforeDispersion: { ...aimDirectionBeforeDispersion },
    dispersionPitchRadians: dispersion.pitchRadians,
    dispersionYawRadians: dispersion.yawRadians,
    recoilPitchRadians: recoil.pitchOffsetRadians,
    recoilYawRadians: recoil.yawOffsetRadians,
    finalProjectileDirection: { ...finalProjectileDirection },
    initialVelocityMetresPerSecond: { ...initialVelocity },
    predictedHitProbability: solution.predictedHitProbability,
    effectiveDispersionRadians: solution.effectiveDispersionRadians,
    roundsBefore,
    roundsAfter,
    fireTaskShotOrdinal: ordinal,
    suppressionContinuousFireScore,
  };
  const projectileRuntime = state.infantryCombatProjectiles;
  const activeShotIds = getActiveShotIds(projectileRuntime);
  activeShotIds.add(shotId);
  const nextLedger = appendBoundedCommitRecord(projectileRuntime, commitRecord, activeShotIds);

  // First authoritative mutation: reserve and populate exactly one projectile slot.
  const spawn = trySpawnProjectile(projectileRuntime, projectileCandidate);
  if (spawn.status !== 'spawned') {
    const status: ShotCommitStatus = spawn.status === 'capacity_exceeded'
      ? 'projectile_capacity_exceeded'
      : spawn.status === 'duplicate_projectile_id'
        ? 'duplicate_projectile_id'
        : 'invalid_projectile_candidate';
    return failure(shooter, status, {
      muzzlePosition: geometry.muzzle,
      friendlyRisk: friendly.risk,
      roundsBefore,
      roundsAfter: roundsBefore,
      aimDirectionBeforeDispersion,
      dispersionPitchRadians: dispersion.pitchRadians,
      dispersionYawRadians: dispersion.yawRadians,
      recoilPitchRadians: recoil.pitchOffsetRadians,
      recoilYawRadians: recoil.yawOffsetRadians,
      finalProjectileDirection,
    });
  }

  weapon.shotSequence = nextShotSequence;
  weapon.roundsInWeapon = roundsAfter;
  weapon.lastCommittedShotId = shotId;
  weapon.automaticFire = preparedCadence.next;
  projectileRuntime.committedShots = nextLedger;
  applySuccessfulShotRecoil(weapon, committedSimulationSeconds, shotId, factors);
  if (!recordCommittedFireTaskShot(shooter, {
    ordinal,
    shotId,
    projectileId,
    committedSeconds: committedSimulationSeconds,
    shotIntervalSeconds: preparedCadence.shotIntervalSeconds,
  })) {
    throw new Error('Committed projectile could not be attached to its FireTask ordinal.');
  }
  if (supportPoint) task.lastSupportPoint = supportPoint;
  return recordResult(shooter, {
    status: 'committed',
    reasonRu: task.mode === 'single' ? 'Одиночный выстрел атомарно зафиксирован.' : 'Выстрел очереди атомарно зафиксирован.',
    shotId,
    projectileId,
    muzzlePosition: geometry.muzzle,
    muzzleBlocked: false,
    friendlyRisk: friendly.risk,
    roundsBefore,
    roundsAfter,
    aimDirectionBeforeDispersion,
    dispersionPitchRadians: dispersion.pitchRadians,
    dispersionYawRadians: dispersion.yawRadians,
    recoilPitchRadians: recoil.pitchOffsetRadians,
    recoilYawRadians: recoil.yawOffsetRadians,
    finalProjectileDirection,
  });
}

function failure(
  shooter: UnitModel,
  status: Exclude<ShotCommitStatus, 'committed' | 'already_committed'>,
  overrides: Partial<Omit<CommitShotResult, 'status' | 'reasonRu' | 'shotId' | 'projectileId'>> = {},
): CommitShotResult {
  return recordResult(shooter, {
    status,
    reasonRu: reasonForStatus(status),
    shotId: null,
    projectileId: null,
    muzzlePosition: overrides.muzzlePosition ?? null,
    muzzleBlocked: overrides.muzzleBlocked ?? false,
    friendlyRisk: overrides.friendlyRisk ?? 0,
    roundsBefore: overrides.roundsBefore ?? null,
    roundsAfter: overrides.roundsAfter ?? null,
    aimDirectionBeforeDispersion: overrides.aimDirectionBeforeDispersion ?? null,
    dispersionPitchRadians: overrides.dispersionPitchRadians ?? 0,
    dispersionYawRadians: overrides.dispersionYawRadians ?? 0,
    recoilPitchRadians: overrides.recoilPitchRadians ?? 0,
    recoilYawRadians: overrides.recoilYawRadians ?? 0,
    finalProjectileDirection: overrides.finalProjectileDirection ?? null,
  });
}

function recordResult(shooter: UnitModel, result: CommitShotResult): CommitShotResult {
  const diagnostic: ShotCommitDiagnosticV1 = {
    status: result.status,
    reasonRu: result.reasonRu,
    muzzlePosition: result.muzzlePosition ? { ...result.muzzlePosition } : null,
    muzzleBlocked: result.muzzleBlocked,
    friendlyRisk: result.friendlyRisk,
    roundsBefore: result.roundsBefore,
    roundsAfter: result.roundsAfter,
    shotId: result.shotId,
    projectileId: result.projectileId,
    aimDirectionBeforeDispersion: result.aimDirectionBeforeDispersion ? { ...result.aimDirectionBeforeDispersion } : null,
    dispersionPitchRadians: result.dispersionPitchRadians,
    dispersionYawRadians: result.dispersionYawRadians,
    recoilPitchRadians: result.recoilPitchRadians,
    recoilYawRadians: result.recoilYawRadians,
    finalProjectileDirection: result.finalProjectileDirection ? { ...result.finalProjectileDirection } : null,
  };
  shooter.infantryCombatRuntime.lastShotCommit = diagnostic;
  return result;
}

function reasonForStatus(status: Exclude<ShotCommitStatus, 'committed' | 'already_committed'>): string {
  if (status === 'movement_forbidden') return 'Оружие запрещает огонь во время фактического движения.';
  if (status === 'aim_solution_invalid') return 'Решение прицеливания отсутствует или недействительно.';
  if (status === 'aim_solution_below_threshold') return 'Качество решения прицеливания ниже заданного порога.';
  if (status === 'cadence_wait') return 'Темп оружия ещё не разрешает следующий выстрел.';
  if (status === 'ordinal_mismatch') return 'Порядковый номер выстрела не совпадает с текущим состоянием очереди.';
  if (status === 'muzzle_blocked') return 'Дульный срез перекрыт препятствием.';
  if (status === 'friendly_risk_exceeded') return 'Коридор выстрела создаёт чрезмерный риск для союзника.';
  if (status === 'empty_weapon') return 'В оружии нет патрона.';
  if (status === 'projectile_capacity_exceeded') return 'Пул физических пуль заполнен.';
  if (status === 'duplicate_projectile_id') return 'Идентификатор физической пули уже существует.';
  if (status === 'invalid_projectile_candidate') return 'Состояние новой физической пули неверно.';
  if (status === 'ownership_lost') return 'Огневая задача потеряла владение каналом оружия.';
  if (status === 'weapon_missing') return 'Экземпляр оружия больше не принадлежит стрелку.';
  if (status === 'unsupported_mode') return 'Режим огня или темп оружия не поддерживается.';
  if (status === 'invalid_target') return 'Подготовленное направление выстрела неверно.';
  return 'Огневая задача не находится в состоянии фиксации выстрела.';
}
function directionBetween(left: BallisticPoint3, right: BallisticPoint3): BallisticDirection3 | null {
  return normalizeFiniteDirection({ x: right.xMetres - left.xMetres, y: right.yMetres - left.yMetres, z: right.zMetres - left.zMetres });
}
function normalizeFiniteDirection(direction: BallisticDirection3): BallisticDirection3 | null {
  if (!isFiniteDirection(direction)) return null;
  const magnitude = Math.hypot(direction.x, direction.y, direction.z);
  if (magnitude <= 1e-9) return null;
  return normalizeDirection(direction);
}
function isFiniteDirection(direction: BallisticDirection3): boolean { return Number.isFinite(direction.x) && Number.isFinite(direction.y) && Number.isFinite(direction.z); }
function distanceToPoint(left: BallisticPoint3, right: BallisticPoint3): number { return Math.hypot(right.xMetres - left.xMetres, right.yMetres - left.yMetres, right.zMetres - left.zMetres); }
function finiteNonNegative(value: unknown, fallback: number): number { const numeric = Math.max(0, typeof value === 'number' && Number.isFinite(value) ? value : fallback); return Math.round(numeric * 1_000_000_000_000) / 1_000_000_000_000; }
