import type { SimulationState } from '../../simulation/SimulationState';
import type { AimFactorBreakdownV1, FireTaskRuntimeV1, InfantryCombatUnitRuntimeV1 } from './InfantryCombatRuntimeTypes';
import {
  MAX_STAGE3_ACTIVE_PROJECTILES,
  MAX_STAGE3_APPLIED_IMPACT_IDS,
  MAX_STAGE3_CATCH_UP_STEPS,
  MAX_STAGE3_COMMIT_LEDGER_ENTRIES,
  MAX_STAGE3_IMPACT_ENTRIES,
  MAX_STAGE3_TERMINATION_ENTRIES,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
} from './ProjectileRuntimeTypes';
import { getProjectileRuntimeDiagnostics } from './ProjectileRuntime';

export interface InfantryCombatDiagnosticsV1 {
  readonly schemaVersion: 1;
  readonly limits: {
    readonly fixedStepSeconds: number;
    readonly maximumActiveProjectiles: number;
    readonly maximumCommitLedgerEntries: number;
    readonly maximumImpactEntries: number;
    readonly maximumTerminationEntries: number;
    readonly maximumAppliedImpactIds: number;
    readonly maximumCatchUpSteps: number;
  };
  readonly projectiles: {
    readonly accumulatorSeconds: number;
    readonly activeCount: number;
    readonly activeProjectileIds: readonly string[];
    readonly committedShotIds: readonly string[];
    readonly impactIds: readonly string[];
    readonly terminationIds: readonly string[];
    readonly appliedImpactCount: number;
    readonly fixedSubstepsExecuted: number;
    readonly sweptTraceCount: number;
    readonly unitCheckCount: number;
    readonly objectCandidateCount: number;
    readonly capacity: number;
    readonly freeCount: number;
    readonly highWaterMark: number;
    readonly spawnCount: number;
    readonly releaseCount: number;
    readonly capRejectionCount: number;
    readonly duplicateSpawnCount: number;
    readonly catchUpLimitedCount: number;
    readonly unitBroadPhaseQueryCount: number;
    readonly unitCandidateCount: number;
    readonly objectBroadPhaseQueryCount: number;
    readonly terrainSampleCount: number;
    readonly impactBufferCapacity: number;
    readonly impactBufferHighWaterMark: number;
    readonly terminationBufferCapacity: number;
    readonly terminationBufferHighWaterMark: number;
    readonly eventOverflowCount: number;
    readonly poolAllocationCount: number;
    readonly poolResizeCount: number;
    readonly scratchAllocationCount: number;
    readonly fullScanFallbackCount: number;
    readonly lastImpactId: string | null;
    readonly lastTerminationId: string | null;
    readonly bodyImpactCount: number;
    readonly bodyPenetrationCount: number;
    readonly penetratedBodyImpactCount: number;
    readonly bodyStopCount: number;
    readonly penetrationLimitCount: number;
    readonly woundAppliedCount: number;
    readonly woundDuplicateCount: number;
    readonly woundTargetMissingCount: number;
    readonly maximumImpactsInSingleSubstep: number;
    readonly lastBodyImpactId: string | null;
    readonly lastBodyBudgetBefore: number;
    readonly lastBodyBudgetAfter: number;
    readonly lastBodyResistance: number;
    readonly lastBodySpeedBefore: number;
    readonly lastBodySpeedAfter: number;
  };
  readonly units: readonly InfantryCombatUnitDiagnosticsV1[];
}

export interface InfantryCombatUnitDiagnosticsV1 {
  readonly unitId: string;
  readonly weapon: null | {
    readonly weaponInstanceId: string;
    readonly weaponDefinitionId: string;
    readonly weaponRevision: number;
    readonly ammoDefinitionId: string;
    readonly ammoRevision: number;
    readonly roundsInWeapon: number;
    readonly shotSequence: number;
    readonly lastCommittedShotId: string | null;
    readonly shootingSkill: number;
    readonly proficiency: string;
    readonly recoilPitchRadians: number;
    readonly recoilYawRadians: number;
    readonly recoilLastUpdatedSeconds: number;
    readonly recoilSequence: number;
  };
  readonly fireTask: null | {
    readonly taskId: string;
    readonly phase: FireTaskRuntimeV1['phase'];
    readonly ownerToken: string;
    readonly actionId: string | null;
    readonly target: FireTaskRuntimeV1['target'];
    readonly trackingUpdateCount: number;
    readonly trackingIntervalSeconds: number;
    readonly lastTrackingBoundarySeconds: number | null;
    readonly nextTrackingBoundarySeconds: number;
    readonly perceivedPosition: FireTaskRuntimeV1['aimTracking']['solution']['perceivedPosition'];
    readonly estimatedPerceivedVelocityMetresPerSecond: FireTaskRuntimeV1['aimTracking']['solution']['estimatedVelocityMetresPerSecond'];
    readonly contactAgeSeconds: number;
    readonly uncertaintyCells: number;
    readonly predictedAimPoint: FireTaskRuntimeV1['aimTracking']['solution']['predictedAimPoint'];
    readonly currentDirection: FireTaskRuntimeV1['aimTracking']['solution']['currentDirection'];
    readonly desiredDirection: FireTaskRuntimeV1['aimTracking']['solution']['desiredDirection'];
    readonly physicalAimQuality: number;
    readonly aimQuality: number;
    readonly solutionQuality: number;
    readonly predictedHitProbability: number;
    readonly effectiveDispersionRadians: number;
    readonly factors: AimFactorBreakdownV1;
    readonly invalidReason: FireTaskRuntimeV1['aimTracking']['solution']['invalidReason'];
    readonly readyRemainingSeconds: number;
    readonly recoveryRemainingSeconds: number;
    readonly committedShotId: string | null;
    readonly resultCode: string | null;
  };
  readonly wounds: InfantryCombatUnitRuntimeV1['wounds'];
  readonly lastFireResult: InfantryCombatUnitRuntimeV1['lastFireResult'];
  readonly lastShotCommit: InfantryCombatUnitRuntimeV1['lastShotCommit'];
}

/** Returns a cloned, read-only projection. It never advances simulation. */
export function getInfantryCombatDiagnostics(state: SimulationState): InfantryCombatDiagnosticsV1 {
  const runtime = state.infantryCombatProjectiles;
  const projectileDiagnostics = getProjectileRuntimeDiagnostics(runtime);
  return {
    schemaVersion: 1,
    limits: {
      fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
      maximumActiveProjectiles: MAX_STAGE3_ACTIVE_PROJECTILES,
      maximumCommitLedgerEntries: MAX_STAGE3_COMMIT_LEDGER_ENTRIES,
      maximumImpactEntries: MAX_STAGE3_IMPACT_ENTRIES,
      maximumTerminationEntries: MAX_STAGE3_TERMINATION_ENTRIES,
      maximumAppliedImpactIds: MAX_STAGE3_APPLIED_IMPACT_IDS,
      maximumCatchUpSteps: MAX_STAGE3_CATCH_UP_STEPS,
    },
    projectiles: {
      accumulatorSeconds: runtime.accumulatorSeconds,
      activeCount: runtime.activeProjectiles.length,
      activeProjectileIds: sorted(runtime.activeProjectiles.map((projectile) => projectile.projectileId)),
      committedShotIds: sorted(runtime.committedShots.map((shot) => shot.shotId)),
      impactIds: sorted(runtime.impacts.map((impact) => impact.impactId)),
      terminationIds: sorted(runtime.terminations.map((termination) => termination.terminationId)),
      appliedImpactCount: runtime.appliedImpactIds.length,
      fixedSubstepsExecuted: runtime.diagnostics.fixedSubstepsExecuted,
      sweptTraceCount: runtime.diagnostics.sweptTraceCount,
      unitCheckCount: runtime.diagnostics.unitCheckCount,
      objectCandidateCount: runtime.diagnostics.objectCandidateCount,
      capacity: projectileDiagnostics.capacity,
      freeCount: projectileDiagnostics.freeCount,
      highWaterMark: projectileDiagnostics.highWaterMark,
      spawnCount: projectileDiagnostics.spawnCount,
      releaseCount: projectileDiagnostics.releaseCount,
      capRejectionCount: projectileDiagnostics.capRejectionCount,
      duplicateSpawnCount: projectileDiagnostics.duplicateSpawnCount,
      catchUpLimitedCount: projectileDiagnostics.catchUpLimitedCount,
      unitBroadPhaseQueryCount: projectileDiagnostics.unitBroadPhaseQueryCount,
      unitCandidateCount: projectileDiagnostics.unitCandidateCount,
      objectBroadPhaseQueryCount: projectileDiagnostics.objectBroadPhaseQueryCount,
      terrainSampleCount: projectileDiagnostics.terrainSampleCount,
      impactBufferCapacity: projectileDiagnostics.impactBufferCapacity,
      impactBufferHighWaterMark: projectileDiagnostics.impactBufferHighWaterMark,
      terminationBufferCapacity: projectileDiagnostics.terminationBufferCapacity,
      terminationBufferHighWaterMark: projectileDiagnostics.terminationBufferHighWaterMark,
      eventOverflowCount: projectileDiagnostics.eventOverflowCount,
      poolAllocationCount: projectileDiagnostics.poolAllocationCount,
      poolResizeCount: projectileDiagnostics.poolResizeCount,
      scratchAllocationCount: projectileDiagnostics.scratchAllocationCount,
      fullScanFallbackCount: projectileDiagnostics.fullScanFallbackCount,
      lastImpactId: projectileDiagnostics.lastImpactId,
      lastTerminationId: projectileDiagnostics.lastTerminationId,
      bodyImpactCount: projectileDiagnostics.bodyImpactCount,
      bodyPenetrationCount: projectileDiagnostics.bodyPenetrationCount,
      penetratedBodyImpactCount: projectileDiagnostics.penetratedBodyImpactCount,
      bodyStopCount: projectileDiagnostics.bodyStopCount,
      penetrationLimitCount: projectileDiagnostics.penetrationLimitCount,
      woundAppliedCount: projectileDiagnostics.woundAppliedCount,
      woundDuplicateCount: projectileDiagnostics.woundDuplicateCount,
      woundTargetMissingCount: projectileDiagnostics.woundTargetMissingCount,
      maximumImpactsInSingleSubstep: projectileDiagnostics.maximumImpactsInSingleSubstep,
      lastBodyImpactId: projectileDiagnostics.lastBodyImpactId,
      lastBodyBudgetBefore: projectileDiagnostics.lastBodyBudgetBefore,
      lastBodyBudgetAfter: projectileDiagnostics.lastBodyBudgetAfter,
      lastBodyResistance: projectileDiagnostics.lastBodyResistance,
      lastBodySpeedBefore: projectileDiagnostics.lastBodySpeedBefore,
      lastBodySpeedAfter: projectileDiagnostics.lastBodySpeedAfter,
    },
    units: state.units.map((unit): InfantryCombatUnitDiagnosticsV1 => {
      const unitRuntime = unit.infantryCombatRuntime;
      const weapon = unitRuntime.primaryWeapon;
      const task = unitRuntime.activeFireTask;
      return {
        unitId: unit.id,
        weapon: weapon ? {
          weaponInstanceId: weapon.weaponInstanceId,
          weaponDefinitionId: weapon.resolved.weaponDefinitionRef.definitionId,
          weaponRevision: weapon.resolved.weaponDefinitionRef.revision,
          ammoDefinitionId: weapon.resolved.ammoDefinitionRef.definitionId,
          ammoRevision: weapon.resolved.ammoDefinitionRef.revision,
          roundsInWeapon: weapon.roundsInWeapon,
          shotSequence: weapon.shotSequence,
          lastCommittedShotId: weapon.lastCommittedShotId,
          shootingSkill: weapon.operatorProfile.shootingSkill,
          proficiency: weapon.operatorProfile.proficiencyByWeaponClass[weapon.resolved.weapon.weaponClass],
          recoilPitchRadians: weapon.recoil.pitchOffsetRadians,
          recoilYawRadians: weapon.recoil.yawOffsetRadians,
          recoilLastUpdatedSeconds: weapon.recoil.lastUpdatedSeconds,
          recoilSequence: weapon.recoil.sequence,
        } : null,
        fireTask: task ? taskDiagnostics(task) : null,
        wounds: structuredClone(unitRuntime.wounds),
        lastFireResult: unitRuntime.lastFireResult ? structuredClone(unitRuntime.lastFireResult) : null,
        lastShotCommit: unitRuntime.lastShotCommit ? structuredClone(unitRuntime.lastShotCommit) : null,
      };
    }).sort((left, right) => left.unitId.localeCompare(right.unitId)),
  };
}

function taskDiagnostics(task: FireTaskRuntimeV1): NonNullable<InfantryCombatUnitDiagnosticsV1['fireTask']> {
  const solution = task.aimTracking.solution;
  return {
    taskId: task.taskId,
    phase: task.phase,
    ownerToken: task.ownerToken,
    actionId: task.actionHandle?.actionId ?? null,
    target: structuredClone(task.target),
    trackingUpdateCount: task.aimTracking.trackingUpdateCount,
    trackingIntervalSeconds: task.aimTracking.trackingIntervalSeconds,
    lastTrackingBoundarySeconds: task.aimTracking.lastTrackingBoundarySeconds,
    nextTrackingBoundarySeconds: task.aimTracking.nextTrackingBoundarySeconds,
    perceivedPosition: solution.perceivedPosition ? structuredClone(solution.perceivedPosition) : null,
    estimatedPerceivedVelocityMetresPerSecond: structuredClone(solution.estimatedVelocityMetresPerSecond),
    contactAgeSeconds: solution.contactAgeSeconds,
    uncertaintyCells: solution.uncertaintyCells,
    predictedAimPoint: solution.predictedAimPoint ? structuredClone(solution.predictedAimPoint) : null,
    currentDirection: structuredClone(solution.currentDirection),
    desiredDirection: structuredClone(solution.desiredDirection),
    physicalAimQuality: solution.physicalAimQuality,
    aimQuality: solution.usableAimQuality,
    solutionQuality: solution.solutionQuality,
    predictedHitProbability: solution.predictedHitProbability,
    effectiveDispersionRadians: solution.effectiveDispersionRadians,
    factors: structuredClone(solution.factors),
    invalidReason: solution.invalidReason,
    readyRemainingSeconds: task.readyRemainingSeconds,
    recoveryRemainingSeconds: task.recoveryRemainingSeconds,
    committedShotId: task.committedShotId,
    resultCode: task.resultCode,
  };
}
function sorted(values: string[]): string[] { return values.sort((left, right) => left.localeCompare(right)); }
