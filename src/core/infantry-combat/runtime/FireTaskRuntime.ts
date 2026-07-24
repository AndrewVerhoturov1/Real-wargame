import type { UnitModel } from '../../units/UnitModel';
import {
  requestSingleFireTask as requestBaseSingleFireTask,
  tickFireTaskWithTimeBudget as tickBaseFireTaskWithTimeBudget,
  failActiveFireTask as failBaseActiveFireTask,
  type RequestSingleFireTaskInput,
  type RequestSingleFireTaskResult,
  type TickFireTaskInput,
  type TickFireTaskResult,
} from './FireTaskRuntimeStage5';

export * from './FireTaskRuntimeStage5';

const EPSILON = 1e-9;

export type Stage6RequestSingleFireTaskResult = RequestSingleFireTaskResult | {
  readonly accepted: false;
  readonly status: 'weapon_capability_lost';
  readonly task: null;
  readonly lease: null;
  readonly reasonCode: 'infantry_fire_task_weapon_capability_lost';
  readonly reasonRu: string;
};

export function requestSingleFireTask(
  unit: UnitModel,
  input: RequestSingleFireTaskInput,
): Stage6RequestSingleFireTaskResult {
  if (!unit.infantryCombatRuntime.wounds.capabilities.canUseWeapon) {
    return {
      accepted: false,
      status: 'weapon_capability_lost',
      task: null,
      lease: null,
      reasonCode: 'infantry_fire_task_weapon_capability_lost',
      reasonRu: 'Ранение не позволяет бойцу пользоваться оружием.',
    };
  }
  return requestBaseSingleFireTask(unit, input);
}

/**
 * Keeps the Stage 5 clock intact, but stops each delegated slice at the next
 * 5 Hz tracking boundary. This lets the Stage 6 wound factors replace the
 * neutral Stage 5 placeholder before any later aiming progress is consumed.
 */
export function tickFireTaskWithTimeBudget(
  unit: UnitModel,
  input: TickFireTaskInput,
): TickFireTaskResult {
  const taskAtStart = unit.infantryCombatRuntime.activeFireTask;
  const totalSeconds = finiteNonNegative(input.deltaSeconds);
  const startSeconds = finiteNonNegative(input.intervalStartSeconds);
  if (taskAtStart && !unit.infantryCombatRuntime.wounds.capabilities.canUseWeapon) {
    failBaseActiveFireTask(unit, {
      endedSeconds: startSeconds,
      resultCode: 'infantry_fire_task_weapon_capability_lost',
      resultRu: 'Огневая задача завершена: ранение не позволяет пользоваться оружием.',
    });
    return {
      taskId: taskAtStart.taskId,
      commitRequested: false,
      completed: false,
      failed: true,
      consumedSeconds: 0,
      remainingSeconds: totalSeconds,
      reasonCode: 'infantry_fire_task_weapon_capability_lost',
    };
  }

  let consumedSeconds = 0;
  let remainingSeconds = totalSeconds;
  let lastResult: TickFireTaskResult = {
    taskId: taskAtStart?.taskId ?? null,
    commitRequested: false,
    completed: false,
    failed: false,
    consumedSeconds: 0,
    remainingSeconds,
    reasonCode: null,
  };

  for (let guard = 0; guard < 64; guard += 1) {
    const task = unit.infantryCombatRuntime.activeFireTask;
    if (!task) return composeTickResult(lastResult, consumedSeconds, remainingSeconds);
    if (!unit.infantryCombatRuntime.wounds.capabilities.canUseWeapon) {
      failBaseActiveFireTask(unit, {
        endedSeconds: startSeconds + consumedSeconds,
        resultCode: 'infantry_fire_task_weapon_capability_lost',
        resultRu: 'Огневая задача завершена: ранение не позволяет пользоваться оружием.',
      });
      return {
        taskId: task.taskId,
        commitRequested: false,
        completed: false,
        failed: true,
        consumedSeconds,
        remainingSeconds,
        reasonCode: 'infantry_fire_task_weapon_capability_lost',
      };
    }

    applyWoundAimCapabilities(unit);
    const now = startSeconds + consumedSeconds;
    const timeToBoundary = Math.max(0, task.aimTracking.nextTrackingBoundarySeconds - now);
    const sliceSeconds = timeToBoundary <= EPSILON
      ? 0
      : Math.min(remainingSeconds, timeToBoundary);
    const beforeBoundary = task.aimTracking.nextTrackingBoundarySeconds;
    const result = tickBaseFireTaskWithTimeBudget(unit, {
      ...input,
      intervalStartSeconds: now,
      deltaSeconds: sliceSeconds,
    });
    lastResult = result;
    const used = Math.max(0, Math.min(sliceSeconds, result.consumedSeconds));
    consumedSeconds = cleanDuration(consumedSeconds + used);
    remainingSeconds = cleanDuration(Math.max(0, totalSeconds - consumedSeconds));
    applyWoundAimCapabilities(unit);

    if (result.commitRequested || result.completed || result.failed) {
      return composeTickResult(result, consumedSeconds, remainingSeconds);
    }
    if (remainingSeconds <= EPSILON) {
      return composeTickResult(result, consumedSeconds, remainingSeconds);
    }
    const current = unit.infantryCombatRuntime.activeFireTask;
    const boundaryAdvanced = Boolean(
      current
      && current.aimTracking.nextTrackingBoundarySeconds > beforeBoundary + EPSILON,
    );
    if (sliceSeconds <= EPSILON && !boundaryAdvanced) {
      return composeTickResult(result, consumedSeconds, remainingSeconds);
    }
    if (sliceSeconds > EPSILON && used + EPSILON < sliceSeconds) {
      return composeTickResult(result, consumedSeconds, remainingSeconds);
    }
  }

  return composeTickResult(lastResult, consumedSeconds, remainingSeconds);
}

export function failActiveFireTask(
  unit: UnitModel,
  input: Parameters<typeof failBaseActiveFireTask>[1],
): void {
  failBaseActiveFireTask(unit, input);
}

export function applyWoundAimCapabilities(unit: UnitModel): void {
  const task = unit.infantryCombatRuntime.activeFireTask;
  if (!task) return;
  const solution = task.aimTracking.solution;
  const capabilities = unit.infantryCombatRuntime.wounds.capabilities;
  const desiredStability = clamp(
    Math.min(capabilities.stabilityMultiplier, capabilities.accuracyMultiplier),
    0.2,
    1,
  );
  const currentStability = clamp(solution.factors.woundStabilityMultiplier, 0.2, 1);
  const ratio = desiredStability / currentStability;
  if (Math.abs(ratio - 1) <= EPSILON) return;
  solution.factors = {
    ...solution.factors,
    fatigue: 0,
    woundStabilityMultiplier: desiredStability,
    woundDispersionMultiplier: solution.factors.woundDispersionMultiplier / ratio,
    aimRateMultiplier: solution.factors.aimRateMultiplier * ratio,
    recoilRecoveryMultiplier: solution.factors.recoilRecoveryMultiplier * ratio,
    recoilImpulseMultiplier: solution.factors.recoilImpulseMultiplier / ratio,
    effectiveDispersionRadians: solution.factors.effectiveDispersionRadians / ratio,
    aimQualityPerSecond: solution.factors.aimQualityPerSecond * ratio,
  };
  solution.effectiveDispersionRadians = Math.max(0, solution.effectiveDispersionRadians / ratio);
  solution.predictedHitProbability = clamp01(solution.predictedHitProbability * ratio);
}

function composeTickResult(
  result: TickFireTaskResult,
  consumedSeconds: number,
  remainingSeconds: number,
): TickFireTaskResult {
  return {
    ...result,
    consumedSeconds: cleanDuration(consumedSeconds),
    remainingSeconds: cleanDuration(remainingSeconds),
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
function cleanDuration(value: number): number {
  if (Math.abs(value) <= EPSILON) return 0;
  return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000;
}
function clamp01(value: number): number { return clamp(value, 0, 1); }
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
