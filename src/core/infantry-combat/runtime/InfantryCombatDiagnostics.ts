import type { SimulationState } from '../../simulation/SimulationState';
import type { FireTaskRuntimeV1, InfantryCombatUnitRuntimeV1 } from './InfantryCombatRuntimeTypes';
import {
  MAX_STAGE3_ACTIVE_PROJECTILES,
  MAX_STAGE3_APPLIED_IMPACT_IDS,
  MAX_STAGE3_CATCH_UP_STEPS,
  MAX_STAGE3_COMMIT_LEDGER_ENTRIES,
  MAX_STAGE3_IMPACT_ENTRIES,
  MAX_STAGE3_TERMINATION_ENTRIES,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
} from './ProjectileRuntimeTypes';

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
    readonly capRejectionCount: number;
    readonly lastImpactId: string | null;
    readonly lastTerminationId: string | null;
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
  };
  readonly fireTask: null | {
    readonly taskId: string;
    readonly phase: FireTaskRuntimeV1['phase'];
    readonly ownerToken: string;
    readonly actionId: string | null;
    readonly target: FireTaskRuntimeV1['target'];
    readonly aimQuality: number;
    readonly readyRemainingSeconds: number;
    readonly recoveryRemainingSeconds: number;
    readonly committedShotId: string | null;
    readonly resultCode: string | null;
  };
  readonly lastFireResult: InfantryCombatUnitRuntimeV1['lastFireResult'];
  readonly lastShotCommit: InfantryCombatUnitRuntimeV1['lastShotCommit'];
}

/**
 * Returns a compact read-only projection for tests, adapters and future UI.
 * Resolved catalog snapshots and active projectile bodies stay outside this view.
 */
export function getInfantryCombatDiagnostics(state: SimulationState): InfantryCombatDiagnosticsV1 {
  const runtime = state.infantryCombatProjectiles;
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
      capRejectionCount: runtime.diagnostics.capRejectionCount,
      lastImpactId: runtime.diagnostics.lastImpactId,
      lastTerminationId: runtime.diagnostics.lastTerminationId,
    },
    units: state.units
      .map((unit): InfantryCombatUnitDiagnosticsV1 => {
        const unitRuntime = unit.infantryCombatRuntime;
        const weapon = unitRuntime.primaryWeapon;
        const task = unitRuntime.activeFireTask;
        return {
          unitId: unit.id,
          weapon: weapon
            ? {
                weaponInstanceId: weapon.weaponInstanceId,
                weaponDefinitionId: weapon.resolved.weaponDefinitionRef.definitionId,
                weaponRevision: weapon.resolved.weaponDefinitionRef.revision,
                ammoDefinitionId: weapon.resolved.ammoDefinitionRef.definitionId,
                ammoRevision: weapon.resolved.ammoDefinitionRef.revision,
                roundsInWeapon: weapon.roundsInWeapon,
                shotSequence: weapon.shotSequence,
                lastCommittedShotId: weapon.lastCommittedShotId,
              }
            : null,
          fireTask: task ? taskDiagnostics(task) : null,
          lastFireResult: unitRuntime.lastFireResult ? structuredClone(unitRuntime.lastFireResult) : null,
          lastShotCommit: unitRuntime.lastShotCommit ? structuredClone(unitRuntime.lastShotCommit) : null,
        };
      })
      .sort((left, right) => left.unitId.localeCompare(right.unitId)),
  };
}

function taskDiagnostics(task: FireTaskRuntimeV1): NonNullable<InfantryCombatUnitDiagnosticsV1['fireTask']> {
  return {
    taskId: task.taskId,
    phase: task.phase,
    ownerToken: task.ownerToken,
    actionId: task.actionHandle?.actionId ?? null,
    target: structuredClone(task.target),
    aimQuality: task.aimQuality,
    readyRemainingSeconds: task.readyRemainingSeconds,
    recoveryRemainingSeconds: task.recoveryRemainingSeconds,
    committedShotId: task.committedShotId,
    resultCode: task.resultCode,
  };
}

function sorted(values: string[]): string[] {
  return values.sort((left, right) => left.localeCompare(right));
}
