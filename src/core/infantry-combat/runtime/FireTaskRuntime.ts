import type { UnitModel } from '../../units/UnitModel';
import { getSuppressionSupportPoint } from './AutomaticFireSupportPoints';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import {
  requestFireTask as requestBaseFireTask,
  requestSingleFireTask as requestBaseSingleFireTask,
  tickFireTaskWithTimeBudget as tickBaseFireTaskWithTimeBudget,
  failActiveFireTask as failBaseActiveFireTask,
  type RequestFireTaskInput,
  type RequestFireTaskResult,
  type RequestSingleFireTaskInput,
  type RequestSingleFireTaskResult,
  type TickFireTaskInput,
  type TickFireTaskResult,
} from './FireTaskRuntimeStage8';
import { MAX_FIRE_TASK_ROUNDS } from './InfantryCombatRuntimeTypes';
import { isTargetWithinDeployedTraverse } from './WeaponDeploymentRuntime';

export * from './FireTaskRuntimeStage8';

const EPSILON = 1e-9;

export type Stage9RequestFireTaskResult = RequestFireTaskResult | {
  readonly accepted: false;
  readonly status: 'weapon_capability_lost' | 'weapon_action_in_progress' | 'deployed_traverse_exceeded';
  readonly task: null;
  readonly lease: null;
  readonly reasonCode: string;
  readonly reasonRu: string;
};
export type Stage9RequestSingleFireTaskResult = RequestSingleFireTaskResult | {
  readonly accepted: false;
  readonly status: 'weapon_capability_lost' | 'weapon_action_in_progress' | 'deployed_traverse_exceeded';
  readonly task: null;
  readonly lease: null;
  readonly reasonCode: string;
  readonly reasonRu: string;
};
/** Compatibility aliases retained for Stage 8 callers. */
export type Stage8RequestFireTaskResult = Stage9RequestFireTaskResult;
export type Stage8RequestSingleFireTaskResult = Stage9RequestSingleFireTaskResult;

export function requestFireTask(
  unit: UnitModel,
  input: RequestFireTaskInput,
): Stage9RequestFireTaskResult {
  if (!getEffectiveCombatCapabilities(unit).canUseWeapon) return capabilityRejected();
  if (hasIncompatibleWeaponAction(unit)) return actionInProgressRejected();
  if (!requestFitsDeploymentTraverse(unit, input)) return traverseRejected();
  return requestBaseFireTask(unit, input);
}

export function requestSingleFireTask(
  unit: UnitModel,
  input: RequestSingleFireTaskInput,
): Stage9RequestSingleFireTaskResult {
  if (!getEffectiveCombatCapabilities(unit).canUseWeapon) return capabilityRejected();
  if (input.mode !== undefined && input.mode !== 'single') return unsupportedSingleModeRejected();
  if (hasIncompatibleWeaponAction(unit)) return actionInProgressRejected();
  const normalized: RequestFireTaskInput = {
    owner: input.owner,
    ownerToken: input.ownerToken,
    target: input.target,
    targetRadiusMetres: 0,
    contactId: input.contactId ?? null,
    sourceUnitId: input.sourceUnitId ?? null,
    mode: 'single',
    minimumSolutionQuality: input.minimumSolutionQuality,
    maximumFriendlyFireRisk: input.maximumFriendlyFireRisk,
    requestedSeconds: input.requestedSeconds,
  };
  if (!requestFitsDeploymentTraverse(unit, normalized)) return traverseRejected();
  return requestBaseSingleFireTask(unit, input);
}

/**
 * Keeps the shared clock intact while stopping delegated slices at tracking
 * boundaries whenever production fatigue or effective capabilities are active.
 */
export function tickFireTaskWithTimeBudget(
  unit: UnitModel,
  input: TickFireTaskInput,
): TickFireTaskResult {
  const taskAtStart = unit.infantryCombatRuntime.activeFireTask;
  const totalSeconds = finiteNonNegative(input.deltaSeconds);
  const startSeconds = finiteNonNegative(input.intervalStartSeconds);
  if (taskAtStart && hasIncompatibleWeaponAction(unit)) {
    failBaseActiveFireTask(unit, {
      endedSeconds: startSeconds,
      resultCode: 'weapon_action_in_progress',
      resultRu: 'Огневая задача завершена: началось несовместимое действие оружия.',
    });
    return failedTick(taskAtStart.taskId, totalSeconds, 'weapon_action_in_progress');
  }
  if (taskAtStart && !getEffectiveCombatCapabilities(unit).canUseWeapon) {
    failBaseActiveFireTask(unit, {
      endedSeconds: startSeconds,
      resultCode: 'infantry_fire_task_weapon_capability_lost',
      resultRu: 'Огневая задача завершена: физическое состояние не позволяет пользоваться оружием.',
    });
    return failedTick(taskAtStart.taskId, totalSeconds, 'infantry_fire_task_weapon_capability_lost');
  }

  if (!input.state || !taskAtStart || taskAtStart.phase === 'recovery') {
    const result = tickBaseFireTaskWithTimeBudget(unit, input);
    applyEffectiveAimCapabilities(unit);
    return result;
  }

  let consumedSeconds = 0;
  let remainingSeconds = totalSeconds;
  let lastResult: TickFireTaskResult = {
    taskId: taskAtStart.taskId,
    commitRequested: false,
    requestedShotOrdinal: null,
    completed: false,
    failed: false,
    consumedSeconds: 0,
    remainingSeconds,
    reasonCode: null,
  };

  for (let guard = 0; guard < 128; guard += 1) {
    const task = unit.infantryCombatRuntime.activeFireTask;
    if (!task) return composeTickResult(lastResult, consumedSeconds, remainingSeconds);
    if (hasIncompatibleWeaponAction(unit)) {
      failBaseActiveFireTask(unit, {
        endedSeconds: startSeconds + consumedSeconds,
        resultCode: 'weapon_action_in_progress',
        resultRu: 'Огневая задача завершена: началось несовместимое действие оружия.',
      });
      return failedTick(task.taskId, remainingSeconds, 'weapon_action_in_progress', consumedSeconds);
    }
    if (!getEffectiveCombatCapabilities(unit).canUseWeapon) {
      failBaseActiveFireTask(unit, {
        endedSeconds: startSeconds + consumedSeconds,
        resultCode: 'infantry_fire_task_weapon_capability_lost',
        resultRu: 'Огневая задача завершена: физическое состояние не позволяет пользоваться оружием.',
      });
      return failedTick(task.taskId, remainingSeconds, 'infantry_fire_task_weapon_capability_lost', consumedSeconds);
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
    const boundaryAdvanced = Boolean(current && current.aimTracking.nextTrackingBoundarySeconds > beforeBoundary + EPSILON);
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
  const desiredStability = clamp(Math.min(capabilities.stabilityMultiplier, capabilities.accuracyMultiplier), 0.2, 1);
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

function requestFitsDeploymentTraverse(unit: UnitModel, input: RequestFireTaskInput): boolean {
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  if (!weapon || weapon.deployment.mode !== 'deployed') return true;
  if (!isTargetWithinDeployedTraverse(weapon, input.target)) return false;
  if (input.mode !== 'suppress') return true;
  const planned = Math.max(1, Math.min(MAX_FIRE_TASK_ROUNDS, weapon.resolved.weapon.longBurstRounds));
  const taskId = `${unit.id}:fire-task:${unit.infantryCombatRuntime.nextFireTaskSequence}`;
  for (let ordinal = 0; ordinal < planned; ordinal += 1) {
    const point = getSuppressionSupportPoint(taskId, ordinal, planned, input.target, input.targetRadiusMetres);
    if (!isTargetWithinDeployedTraverse(weapon, point)) return false;
  }
  return true;
}
function hasIncompatibleWeaponAction(unit: UnitModel): boolean {
  const runtime = unit.infantryCombatRuntime;
  return Boolean(runtime.primaryWeapon?.deployment.activeAction || runtime.ammoInventory.activeReload || runtime.ammoInventory.activeTransfer);
}
function capabilityRejected(): Stage9RequestFireTaskResult {
  return { accepted: false, status: 'weapon_capability_lost', task: null, lease: null, reasonCode: 'infantry_fire_task_weapon_capability_lost', reasonRu: 'Физическое состояние не позволяет бойцу пользоваться оружием.' };
}
function unsupportedSingleModeRejected(): RequestSingleFireTaskResult {
  return { accepted: false, status: 'unsupported_mode', task: null, lease: null, reasonCode: 'infantry_fire_task_unsupported_mode', reasonRu: 'Одиночная огневая задача не поддерживает запрошенный режим огня.' };
}
function actionInProgressRejected(): Stage9RequestFireTaskResult {
  return { accepted: false, status: 'weapon_action_in_progress', task: null, lease: null, reasonCode: 'weapon_action_in_progress', reasonRu: 'Стрельба недоступна, пока выполняется другое действие оружия.' };
}
function traverseRejected(): Stage9RequestFireTaskResult {
  return { accepted: false, status: 'deployed_traverse_exceeded', task: null, lease: null, reasonCode: 'deployed_traverse_exceeded', reasonRu: 'Цель или одна из опорных точек находится вне сектора установленного пулемёта.' };
}
function failedTick(taskId: string, remainingSeconds: number, reasonCode: string, consumedSeconds = 0): TickFireTaskResult {
  return { taskId, commitRequested: false, requestedShotOrdinal: null, completed: false, failed: true, consumedSeconds, remainingSeconds, reasonCode };
}
function composeTickResult(result: TickFireTaskResult, consumedSeconds: number, remainingSeconds: number): TickFireTaskResult { return { ...result, consumedSeconds: cleanDuration(consumedSeconds), remainingSeconds: cleanDuration(remainingSeconds) }; }
function finiteNonNegative(value: number): number { return Number.isFinite(value) ? Math.max(0, value) : 0; }
function cleanDuration(value: number): number { if (Math.abs(value) <= EPSILON) return 0; return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function clamp01(value: number): number { return clamp(value, 0, 1); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum)); }
