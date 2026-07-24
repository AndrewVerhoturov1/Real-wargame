import type { UnitModel } from '../../units/UnitModel';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
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
  if (!getEffectiveCombatCapabilities(unit).canUseWeapon) {
    return {
      accepted: false,
      status: 'weapon_capability_lost',
      task: null,
      lease: null,
      reasonCode: 'infantry_fire_task_weapon_capability_lost',
      reasonRu: 'Физическое состояние не позволяет бойцу пользоваться оружием.',
    };
  }
  return requestBaseSingleFireTask(unit, input);
}

/**
 * Keeps the Stage 5 clock intact, while stopping delegated slices at tracking
 * boundaries whenever Stage 7 fatigue or effective capabilities are non-neutral.
 */
export function tickFireTaskWithTimeBudget(
  unit: UnitModel,
  input: TickFireTaskInput,
): TickFireTaskResult {
  const taskAtStart = unit.infantryCombatRuntime.activeFireTask;
  const totalSeconds = finiteNonNegative(input.deltaSeconds);
  const startSeconds = finiteNonNegative(input.intervalStartSeconds);
  if (taskAtStart && !getEffectiveCombatCapabilities(unit).canUseWeapon) {
    failBaseActiveFireTask(unit, {
      endedSeconds: startSeconds,
      resultCode: 'infantry_fire_task_weapon_capability_lost',
      resultRu: 'Огневая задача завершена: физическое состояние не позволяет пользоваться оружием.',
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

  if (!taskAtStart || hasCurrentEffectiveAimPath(unit, taskAtStart)) {
    const result = tickBaseFireTaskWithTimeBudget(unit, input);
    applyEffectiveAimCapabilities(unit);
    return result;
  }

  let consumedSeconds = 0;
  let remainingSeconds = totalSeconds;
  let lastResult: TickFireTaskResult = {
    taskId: taskAtStart.taskId,
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
    if (!getEffectiveCombatCapabilities(unit).canUseWeapon) {
      failBaseActiveFireTask(unit, {
        endedSeconds: startSeconds + consumedSeconds,
        resultCode: 'infantry_fire_task_weapon_capability_lost',
        resultRu: 'Огневая задача завершена: физическое состояние не позволяет пользоваться оружием.',
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

    applyEffectiveAimCapabilities(unit);
    const now = startSeconds + consumedSeconds;
    const timeToBoundary = Math.max(0, task.aimTracking.nextTrackingBoundarySeconds - now);
    const sliceSeconds = timeToBoundary <= EPSILON ? 0 : Math.min(remainingSeconds, timeToBoundary);
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
    applyEffectiveAimCapabilities(unit);

    if (result.commitRequested || result.completed || result.failed) {
      return composeTickResult(result, consumedSeconds, remainingSeconds);
    }
    if (remainingSeconds <= EPSILON) return composeTickResult(result, consumedSeconds, remainingSeconds);
    const current = unit.infantryCombatRuntime.activeFireTask;
    const boundaryAdvanced = Boolean(
      current && current.aimTracking.nextTrackingBoundarySeconds > beforeBoundary + EPSILON,
    );
    if (sliceSeconds <= EPSILON && !boundaryAdvanced) return composeTickResult(result, consumedSeconds, remainingSeconds);
    if (sliceSeconds > EPSILON && used + EPSILON < sliceSeconds) return composeTickResult(result, consumedSeconds, remainingSeconds);
  }

  return composeTickResult(lastResult, consumedSeconds, remainingSeconds);
}

export function failActiveFireTask(
  unit: UnitModel,
  input: Parameters<typeof failBaseActiveFireTask>[1],
): void {
  failBaseActiveFireTask(unit, input);
}

export function applyEffectiveAimCapabilities(unit: UnitModel): void {
  const task = unit.infantryCombatRuntime.activeFireTask;
  if (!task) return;
  const solution = task.aimTracking.solution;
  const capabilities = getEffectiveCombatCapabilities(unit);
  const desiredStability = clamp(
    Math.min(capabilities.stabilityMultiplier, capabilities.accuracyMultiplier),
    0.2,
    1,
  );
  const desiredFatigue = clamp01(unit.infantryCombatRuntime.physiology.fatigue.fatigue);
  const currentStability = clamp(solution.factors.woundStabilityMultiplier, 0.2, 1);
  const currentFatigue = clamp01(solution.factors.fatigue);
  const currentFatigueDispersion = 1 + currentFatigue * 0.6;
  const desiredFatigueDispersion = 1 + desiredFatigue * 0.6;
  const currentFatigueAim = 1 - currentFatigue * 0.45;
  const desiredFatigueAim = 1 - desiredFatigue * 0.45;
  const stabilityRatio = desiredStability / currentStability;
  const aimRatio = (desiredFatigueAim / currentFatigueAim) * stabilityRatio;
  const dispersionRatio = (desiredFatigueDispersion / currentFatigueDispersion) / stabilityRatio;
  if (Math.abs(aimRatio - 1) <= EPSILON && Math.abs(dispersionRatio - 1) <= EPSILON) return;

  solution.factors = {
    ...solution.factors,
    fatigue: desiredFatigue,
    woundStabilityMultiplier: desiredStability,
    fatigueDispersionMultiplier: desiredFatigueDispersion,
    woundDispersionMultiplier: solution.factors.woundDispersionMultiplier / stabilityRatio,
    aimRateMultiplier: solution.factors.aimRateMultiplier * aimRatio,
    recoilRecoveryMultiplier: solution.factors.recoilRecoveryMultiplier * aimRatio,
    recoilImpulseMultiplier: solution.factors.recoilImpulseMultiplier * dispersionRatio,
    effectiveDispersionRadians: solution.factors.effectiveDispersionRadians * dispersionRatio,
    aimQualityPerSecond: solution.factors.aimQualityPerSecond * aimRatio,
  };
  solution.effectiveDispersionRadians = Math.max(0, solution.effectiveDispersionRadians * dispersionRatio);
  solution.predictedHitProbability = clamp01(solution.predictedHitProbability / Math.max(EPSILON, dispersionRatio));
}

/** Stage 6 compatibility alias. */
export const applyWoundAimCapabilities = applyEffectiveAimCapabilities;

function hasCurrentEffectiveAimPath(
  unit: UnitModel,
  task: NonNullable<UnitModel['infantryCombatRuntime']['activeFireTask']>,
): boolean {
  const capabilities = getEffectiveCombatCapabilities(unit);
  const desiredStability = Math.min(capabilities.stabilityMultiplier, capabilities.accuracyMultiplier);
  const desiredFatigue = unit.infantryCombatRuntime.physiology.fatigue.fatigue;
  return Math.abs(desiredStability - task.aimTracking.solution.factors.woundStabilityMultiplier) <= EPSILON
    && Math.abs(desiredFatigue - task.aimTracking.solution.factors.fatigue) <= EPSILON;
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
function finiteNonNegative(value: number): number { return Number.isFinite(value) ? Math.max(0, value) : 0; }
function cleanDuration(value: number): number {
  if (Math.abs(value) <= EPSILON) return 0;
  return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000;
}
function clamp01(value: number): number { return clamp(value, 0, 1); }
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
