import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import { beginFireTaskRecovery, failActiveFireTask } from './FireTaskRuntime';
import {
  MAX_STAGE3_ACTIVE_PROJECTILES,
  MAX_STAGE3_APPLIED_IMPACT_IDS,
  MAX_STAGE3_COMMIT_LEDGER_ENTRIES,
  MAX_STAGE3_IMPACT_ENTRIES,
  MAX_STAGE3_TERMINATION_ENTRIES,
  PROJECTILE_STATE_SCHEMA_VERSION,
  PROJECTILE_TERMINATION_SCHEMA_VERSION,
  SHOT_COMMIT_RECORD_SCHEMA_VERSION,
  type ProjectileStateV1,
  type ProjectileTerminationV1,
  type ShotCommitRecordV1,
} from './ProjectileRuntimeTypes';
import { normalizeReferenceProjectileRuntimeState } from './ReferenceProjectileRuntime';

/** Deterministic, idempotent repair invoked once after a scene load. */
export function reconcileInfantryCombatRuntimeAfterLoad(state: SimulationState): void {
  state.infantryCombatProjectiles = normalizeReferenceProjectileRuntimeState(state.infantryCombatProjectiles);
  const runtime = state.infantryCombatProjectiles;

  runtime.committedShots = uniqueBy(runtime.committedShots, (record) => record.shotId)
    .sort(compareCommitRecords)
    .slice(-MAX_STAGE3_COMMIT_LEDGER_ENTRIES);
  runtime.impacts = uniqueBy(runtime.impacts, (impact) => impact.impactId)
    .sort(compareImpacts)
    .slice(-MAX_STAGE3_IMPACT_ENTRIES);
  runtime.terminations = uniqueBy(runtime.terminations, (termination) => termination.terminationId)
    .sort(compareTerminations)
    .slice(-MAX_STAGE3_TERMINATION_ENTRIES);
  runtime.appliedImpactIds = [...new Set([
    ...runtime.appliedImpactIds,
    ...runtime.impacts.map((impact) => impact.impactId),
  ])].sort(compareText).slice(-MAX_STAGE3_APPLIED_IMPACT_IDS);

  const units = [...state.units].sort(compareUnits);
  const taskByCommittedShotId = new Map<string, UnitModel>();
  for (const unit of units) {
    const task = unit.infantryCombatRuntime.activeFireTask;
    if (task?.committedShotId) taskByCommittedShotId.set(task.committedShotId, unit);
  }

  const recordsByShotId = new Map(runtime.committedShots.map((record) => [record.shotId, record]));
  const reconciledProjectiles: ProjectileStateV1[] = [];
  for (const projectile of uniqueBy(runtime.activeProjectiles, (item) => item.projectileId).sort(compareProjectiles)) {
    if (hasRecordedOutcome(runtime, projectile.shotId)) continue;
    let record = recordsByShotId.get(projectile.shotId);
    if (!record) {
      const unit = taskByCommittedShotId.get(projectile.shotId);
      const task = unit?.infantryCombatRuntime.activeFireTask;
      const weapon = unit?.infantryCombatRuntime.primaryWeapon;
      if (unit && task && weapon && task.committedShotId === projectile.shotId) {
        record = reconstructCommitRecord(unit, task.taskId, projectile, state.simulationTimeSeconds);
        runtime.committedShots.push(record);
        recordsByShotId.set(record.shotId, record);
      }
    }
    if (!record) {
      appendOrphanTermination(runtime, projectile, state.simulationTimeSeconds);
      continue;
    }
    reconciledProjectiles.push(projectile);
  }
  runtime.committedShots = uniqueBy(runtime.committedShots, (record) => record.shotId)
    .sort(compareCommitRecords)
    .slice(-MAX_STAGE3_COMMIT_LEDGER_ENTRIES);
  runtime.activeProjectiles = reconciledProjectiles.sort(compareProjectiles).slice(0, MAX_STAGE3_ACTIVE_PROJECTILES);

  for (const unit of units) reconcileCommittedTask(state, unit);
  runtime.activeProjectiles = uniqueBy(runtime.activeProjectiles, (projectile) => projectile.projectileId)
    .sort(compareProjectiles)
    .slice(0, MAX_STAGE3_ACTIVE_PROJECTILES);
}

function reconcileCommittedTask(state: SimulationState, unit: UnitModel): void {
  const task = unit.infantryCombatRuntime.activeFireTask;
  const shotId = task?.committedShotId;
  if (!task || !shotId) return;
  const runtime = state.infantryCombatProjectiles;
  const record = runtime.committedShots.find((candidate) => candidate.shotId === shotId);
  if (!record) {
    failActiveFireTask(unit, {
      endedSeconds: state.simulationTimeSeconds,
      resultCode: 'infantry_fire_task_reconciliation_missing_commit',
      resultRu: 'Огневая задача не восстановлена: отсутствует запись атомарного выстрела.',
    });
    return;
  }

  const hasOutcome = hasRecordedOutcome(runtime, shotId);
  const hasActiveProjectile = runtime.activeProjectiles.some((projectile) => projectile.shotId === shotId);
  if (!hasOutcome && !hasActiveProjectile) {
    const weapon = unit.infantryCombatRuntime.primaryWeapon;
    if (!weapon || weapon.weaponInstanceId !== record.weaponInstanceId) {
      failActiveFireTask(unit, {
        endedSeconds: state.simulationTimeSeconds,
        resultCode: 'infantry_fire_task_reconciliation_weapon_missing',
        resultRu: 'Огневая задача не восстановлена: точный экземпляр винтовки отсутствует.',
      });
      return;
    }
    runtime.activeProjectiles.push({
      schemaVersion: PROJECTILE_STATE_SCHEMA_VERSION,
      projectileId: `${shotId}:projectile`,
      shotId,
      shooterId: record.shooterId,
      ammoSnapshot: structuredClone(weapon.resolved.ammo),
      position: structuredClone(record.muzzlePosition),
      velocityMetresPerSecond: structuredClone(record.initialVelocityMetresPerSecond),
      ageSeconds: 0,
      maximumLifetimeSeconds: weapon.resolved.ammo.maximumLifetimeSeconds,
      bodyPenetrationBudget: weapon.resolved.ammo.bodyPenetrationBudget,
      impactSequence: 0,
    });
  }
  if (task.phase === 'firing') {
    beginFireTaskRecovery(unit, {
      committedShotId: shotId,
      startedSeconds: record.committedSimulationSeconds,
    });
  }
}

function reconstructCommitRecord(
  unit: UnitModel,
  fireTaskId: string,
  projectile: ProjectileStateV1,
  fallbackSeconds: number,
): ShotCommitRecordV1 {
  const weapon = unit.infantryCombatRuntime.primaryWeapon!;
  return {
    schemaVersion: SHOT_COMMIT_RECORD_SCHEMA_VERSION,
    shotId: projectile.shotId,
    shooterId: unit.id,
    fireTaskId,
    weaponInstanceId: weapon.weaponInstanceId,
    weaponDefinitionRef: structuredClone(weapon.resolved.weaponDefinitionRef),
    ammoDefinitionRef: structuredClone(weapon.resolved.ammoDefinitionRef),
    committedSimulationSeconds: canonicalSeconds(Math.max(0, fallbackSeconds - projectile.ageSeconds)),
    muzzlePosition: structuredClone(projectile.position),
    initialVelocityMetresPerSecond: structuredClone(projectile.velocityMetresPerSecond),
    roundsBefore: weapon.roundsInWeapon + 1,
    roundsAfter: weapon.roundsInWeapon,
  };
}

function hasRecordedOutcome(
  runtime: SimulationState['infantryCombatProjectiles'],
  shotId: string,
): boolean {
  return runtime.impacts.some((impact) => impact.shotId === shotId)
    || runtime.terminations.some((termination) => termination.shotId === shotId)
    || runtime.appliedImpactIds.some((impactId) => impactId.startsWith(`${shotId}:impact:`));
}

function appendOrphanTermination(
  runtime: SimulationState['infantryCombatProjectiles'],
  projectile: ProjectileStateV1,
  simulationSeconds: number,
): void {
  const termination: ProjectileTerminationV1 = {
    schemaVersion: PROJECTILE_TERMINATION_SCHEMA_VERSION,
    terminationId: `${projectile.shotId}:termination`,
    projectileId: projectile.projectileId,
    shotId: projectile.shotId,
    reason: 'reconciled_orphan',
    simulationSeconds: canonicalSeconds(simulationSeconds),
    point: structuredClone(projectile.position),
  };
  if (!runtime.terminations.some((candidate) => candidate.terminationId === termination.terminationId)) {
    runtime.terminations = [...runtime.terminations, termination]
      .sort(compareTerminations)
      .slice(-MAX_STAGE3_TERMINATION_ENTRIES);
    runtime.diagnostics.lastTerminationId = termination.terminationId;
  }
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const result: T[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(structuredClone(value));
  }
  return result;
}

function compareUnits(left: UnitModel, right: UnitModel): number {
  return compareText(left.id, right.id);
}

function compareProjectiles(left: ProjectileStateV1, right: ProjectileStateV1): number {
  return compareText(left.projectileId, right.projectileId);
}

function compareCommitRecords(left: ShotCommitRecordV1, right: ShotCommitRecordV1): number {
  return left.committedSimulationSeconds - right.committedSimulationSeconds || compareText(left.shotId, right.shotId);
}

function compareImpacts(
  left: SimulationState['infantryCombatProjectiles']['impacts'][number],
  right: SimulationState['infantryCombatProjectiles']['impacts'][number],
): number {
  return left.simulationSeconds - right.simulationSeconds || compareText(left.impactId, right.impactId);
}

function compareTerminations(left: ProjectileTerminationV1, right: ProjectileTerminationV1): number {
  return left.simulationSeconds - right.simulationSeconds || compareText(left.terminationId, right.terminationId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalSeconds(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000;
}
