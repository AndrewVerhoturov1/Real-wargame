import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  failActiveFireTask,
  tickFireTaskWithTimeBudget,
} from './FireTaskRuntime';
import {
  MAX_FIRE_TASK_ROUNDS,
  type FireTaskRuntimeV1,
  type InfantryWeaponInstanceV1,
  type ShotCommitStatus,
} from './InfantryCombatRuntimeTypes';
import { tickReferenceProjectiles } from './ReferenceProjectileStepper';
import { commitShot, type CommitShotResult } from './ShotCommitService';
import { advanceSuppressionRuntimeTo } from './SuppressionRuntime';

const TIME_EPSILON_SECONDS = 1e-9;
const COMMIT_CANONICAL_SCALE = 1_000_000_000_000;

export interface TickInfantryCombatSimulationInput { readonly intervalStartSeconds: number; readonly deltaSeconds: number; }
export interface TickInfantryCombatSimulationResult { readonly commitResults: readonly CommitShotResult[]; readonly projectileSubsteps: number; }
interface PendingCommit {
  readonly unit: UnitModel;
  readonly task: FireTaskRuntimeV1;
  readonly weapon: InfantryWeaponInstanceV1;
  readonly offsetSeconds: number;
  readonly shotOrdinal: number;
}
interface PendingRecovery { readonly unit: UnitModel; readonly intervalStartSeconds: number; readonly deltaSeconds: number; }

/** One physical combat segment. The Stage 7 wrapper is the only outer caller. */
export function tickInfantryCombatSimulationSegment(
  state: SimulationState,
  input: TickInfantryCombatSimulationInput,
): TickInfantryCombatSimulationResult {
  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds);
  const deltaSeconds = finiteNonNegative(input.deltaSeconds);
  const units = state.units.filter((unit) => Boolean(unit.infantryCombatRuntime.activeFireTask)).sort(compareUnits);
  const pendingCommits: PendingCommit[] = [];
  const recoveries = new Map<string, PendingRecovery>();

  for (const unit of units) {
    const taskAtStart = unit.infantryCombatRuntime.activeFireTask;
    if (!taskAtStart) continue;
    if (taskAtStart.phase === 'recovery') {
      recoveries.set(unit.id, { unit, intervalStartSeconds, deltaSeconds });
      continue;
    }
    scheduleNextCommit(state, unit, intervalStartSeconds, deltaSeconds, 0, pendingCommits, recoveries);
  }

  pendingCommits.sort(comparePendingCommits);
  const commitResults: CommitShotResult[] = [];
  let projectileSubsteps = 0;
  let cursorSeconds = 0;
  const maximumCommitEvents = Math.max(1, units.length * MAX_FIRE_TASK_ROUNDS);
  let processedCommitEvents = 0;

  while (pendingCommits.length > 0) {
    const pending = pendingCommits.shift()!;
    const offsetSeconds = Math.max(cursorSeconds, clamp(pending.offsetSeconds, 0, deltaSeconds));
    if (offsetSeconds > cursorSeconds + TIME_EPSILON_SECONDS) {
      projectileSubsteps += tickProjectilesWithoutFalseCatchUp(state, {
        intervalStartSeconds: intervalStartSeconds + cursorSeconds,
        deltaSeconds: offsetSeconds - cursorSeconds,
      });
    }
    const currentTask = pending.unit.infantryCombatRuntime.activeFireTask;
    const currentWeapon = pending.unit.infantryCombatRuntime.primaryWeapon;
    if (
      currentTask !== pending.task
      || currentWeapon !== pending.weapon
      || currentTask?.phase !== 'firing'
    ) {
      cursorSeconds = offsetSeconds;
      continue;
    }
    const committedSeconds = canonicalValue(intervalStartSeconds + offsetSeconds);
    canonicalizeCommitAimSolution(pending.task);
    const result = commitShot({
      state,
      shooter: pending.unit,
      task: pending.task,
      weapon: pending.weapon,
      committedSeconds,
      shotOrdinal: pending.shotOrdinal,
    });
    commitResults.push(result);
    processedCommitEvents += 1;
    if (processedCommitEvents > maximumCommitEvents) throw new Error('FireTask commit-event bound exceeded.');

    if (result.status === 'committed' || result.status === 'already_committed') {
      const active = pending.unit.infantryCombatRuntime.activeFireTask;
      if (active?.phase === 'recovery') {
        recoveries.set(pending.unit.id, {
          unit: pending.unit,
          intervalStartSeconds: committedSeconds,
          deltaSeconds: Math.max(0, deltaSeconds - offsetSeconds),
        });
      } else if (active?.phase === 'firing' && active.nextShotOrdinal < active.plannedRoundCount) {
        scheduleNextCommit(
          state,
          pending.unit,
          committedSeconds,
          Math.max(0, deltaSeconds - offsetSeconds),
          offsetSeconds,
          pendingCommits,
          recoveries,
        );
        pendingCommits.sort(comparePendingCommits);
      }
    } else if (result.status === 'cadence_wait') {
      pending.task.nextShotBoundarySeconds = pending.weapon.automaticFire.nextShotAllowedSeconds;
      scheduleNextCommit(
        state,
        pending.unit,
        committedSeconds,
        Math.max(0, deltaSeconds - offsetSeconds),
        offsetSeconds,
        pendingCommits,
        recoveries,
      );
      pendingCommits.sort(comparePendingCommits);
    } else {
      terminalizeCommitFailure(pending.unit, result.status, committedSeconds);
    }
    cursorSeconds = offsetSeconds;
  }

  if (deltaSeconds > cursorSeconds + TIME_EPSILON_SECONDS || commitResults.length === 0) {
    projectileSubsteps += tickProjectilesWithoutFalseCatchUp(state, {
      intervalStartSeconds: intervalStartSeconds + cursorSeconds,
      deltaSeconds: Math.max(0, deltaSeconds - cursorSeconds),
    });
  }

  for (const recovery of [...recoveries.values()].sort((left, right) => compareText(left.unit.id, right.unit.id))) {
    if (recovery.deltaSeconds <= TIME_EPSILON_SECONDS) continue;
    if (recovery.unit.infantryCombatRuntime.activeFireTask?.phase !== 'recovery') continue;
    tickFireTaskWithTimeBudget(recovery.unit, {
      intervalStartSeconds: recovery.intervalStartSeconds,
      deltaSeconds: recovery.deltaSeconds,
    });
  }
  const endSeconds = canonicalValue(intervalStartSeconds + deltaSeconds);
  for (const unit of [...state.units].sort(compareUnits)) {
    advanceSuppressionRuntimeTo(unit.infantryCombatRuntime.suppression, endSeconds);
  }
  return { commitResults, projectileSubsteps };
}

function scheduleNextCommit(
  state: SimulationState,
  unit: UnitModel,
  localStartSeconds: number,
  localDeltaSeconds: number,
  baseOffsetSeconds: number,
  pendingCommits: PendingCommit[],
  recoveries: Map<string, PendingRecovery>,
): void {
  if (localDeltaSeconds < 0) return;
  const ticked = tickFireTaskWithTimeBudget(unit, {
    intervalStartSeconds: localStartSeconds,
    deltaSeconds: localDeltaSeconds,
    state,
  });
  if (ticked.commitRequested && ticked.requestedShotOrdinal !== null) {
    const task = unit.infantryCombatRuntime.activeFireTask;
    const weapon = unit.infantryCombatRuntime.primaryWeapon;
    if (task && weapon && task.taskId === ticked.taskId) {
      pendingCommits.push({
        unit,
        task,
        weapon,
        offsetSeconds: canonicalValue(baseOffsetSeconds + clamp(ticked.consumedSeconds, 0, localDeltaSeconds)),
        shotOrdinal: ticked.requestedShotOrdinal,
      });
    }
  } else if (unit.infantryCombatRuntime.activeFireTask?.phase === 'recovery') {
    recoveries.set(unit.id, {
      unit,
      intervalStartSeconds: canonicalValue(localStartSeconds + ticked.consumedSeconds),
      deltaSeconds: Math.max(0, localDeltaSeconds - ticked.consumedSeconds),
    });
  }
}

function tickProjectilesWithoutFalseCatchUp(
  state: SimulationState,
  input: { readonly intervalStartSeconds: number; readonly deltaSeconds: number },
): number {
  const runtime = state.infantryCombatProjectiles;
  const catchUpBefore = runtime.diagnostics.catchUpLimitedCount;
  const result = tickReferenceProjectiles(state, input);
  if (runtime.pool.activeCount === 0 && runtime.accumulatorSeconds === 0) runtime.diagnostics.catchUpLimitedCount = catchUpBefore;
  return result.executedSubsteps;
}

function canonicalizeCommitAimSolution(task: FireTaskRuntimeV1): void {
  const solution = task.aimTracking.solution;
  const direction = solution.currentDirection;
  if (Number.isFinite(direction.x) && Number.isFinite(direction.y) && Number.isFinite(direction.z)) {
    const magnitude = Math.hypot(direction.x, direction.y, direction.z);
    if (magnitude > TIME_EPSILON_SECONDS) {
      const rounded = { x: canonicalValue(direction.x / magnitude), y: canonicalValue(direction.y / magnitude), z: canonicalValue(direction.z / magnitude) };
      const roundedMagnitude = Math.hypot(rounded.x, rounded.y, rounded.z);
      if (roundedMagnitude > TIME_EPSILON_SECONDS) {
        solution.currentDirection = { x: rounded.x / roundedMagnitude, y: rounded.y / roundedMagnitude, z: rounded.z / roundedMagnitude };
      }
    }
  }
  solution.physicalAimQuality = canonicalUnitInterval(solution.physicalAimQuality);
  solution.solutionQuality = canonicalUnitInterval(solution.solutionQuality);
  solution.usableAimQuality = canonicalUnitInterval(solution.usableAimQuality);
  solution.predictedHitProbability = canonicalUnitInterval(solution.predictedHitProbability);
  solution.effectiveDispersionRadians = canonicalNonNegative(solution.effectiveDispersionRadians);
  task.aimQuality = solution.usableAimQuality;
  const predicted = solution.predictedAimPoint;
  if (predicted) {
    predicted.xMetres = canonicalValue(predicted.xMetres);
    predicted.yMetres = canonicalValue(predicted.yMetres);
    predicted.zMetres = canonicalValue(predicted.zMetres);
  }
}

function terminalizeCommitFailure(
  unit: UnitModel,
  status: Exclude<ShotCommitStatus, 'committed' | 'already_committed'>,
  endedSeconds: number,
): void {
  failActiveFireTask(unit, {
    endedSeconds,
    denied: isDeniedCommitStatus(status),
    resultCode: `infantry_fire_task_commit_${status}`,
    resultRu: commitFailureText(status),
  });
}
function isDeniedCommitStatus(status: Exclude<ShotCommitStatus, 'committed' | 'already_committed'>): boolean {
  return status === 'unsupported_mode'
    || status === 'empty_weapon'
    || status === 'aim_solution_invalid'
    || status === 'aim_solution_below_threshold'
    || status === 'movement_forbidden'
    || status === 'muzzle_blocked'
    || status === 'friendly_risk_exceeded'
    || status === 'projectile_capacity_exceeded'
    || status === 'duplicate_projectile_id'
    || status === 'invalid_projectile_candidate'
    || status === 'weapon_capability_lost'
    || status === 'ordinal_mismatch';
}
function commitFailureText(status: Exclude<ShotCommitStatus, 'committed' | 'already_committed'>): string {
  if (status === 'empty_weapon') return 'Выстрел отклонён: в оружии нет патрона.';
  if (status === 'aim_solution_invalid') return 'Выстрел отклонён: решение прицеливания недействительно.';
  if (status === 'aim_solution_below_threshold') return 'Выстрел отклонён: качество решения ниже заданного порога.';
  if (status === 'movement_forbidden') return 'Выстрел отклонён: это оружие запрещает огонь во время фактического движения.';
  if (status === 'cadence_wait') return 'Выстрел отложен до следующей разрешённой границы темпа.';
  if (status === 'ordinal_mismatch') return 'Выстрел отклонён: нарушен порядковый номер очереди.';
  if (status === 'muzzle_blocked') return 'Выстрел отклонён: дульный срез перекрыт.';
  if (status === 'friendly_risk_exceeded') return 'Выстрел отклонён: превышен допустимый риск для союзника.';
  if (status === 'projectile_capacity_exceeded') return 'Выстрел отклонён: заполнен ограниченный пул физических пуль.';
  if (status === 'duplicate_projectile_id') return 'Выстрел отклонён: обнаружен повторный идентификатор пули.';
  if (status === 'invalid_projectile_candidate') return 'Выстрел отклонён: состояние новой пули неверно.';
  if (status === 'unsupported_mode') return 'Выстрел отклонён: режим оружия не поддерживается.';
  if (status === 'weapon_capability_lost') return 'Выстрел отклонён: физическое состояние не позволяет пользоваться оружием.';
  if (status === 'ownership_lost') return 'Огневая задача завершилась ошибкой: потерян точный захват канала оружия.';
  if (status === 'weapon_missing') return 'Огневая задача завершилась ошибкой: экземпляр оружия отсутствует.';
  if (status === 'invalid_target') return 'Огневая задача завершилась ошибкой: направление решения прицеливания неверно.';
  return 'Огневая задача завершилась ошибкой до атомарного выстрела.';
}
function comparePendingCommits(left: PendingCommit, right: PendingCommit): number {
  return left.offsetSeconds - right.offsetSeconds
    || compareText(left.task.taskId, right.task.taskId)
    || left.shotOrdinal - right.shotOrdinal;
}
function compareUnits(left: UnitModel, right: UnitModel): number { return compareText(left.id, right.id); }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function canonicalValue(value: number): number { return Math.round(value * COMMIT_CANONICAL_SCALE) / COMMIT_CANONICAL_SCALE; }
function canonicalNonNegative(value: number): number { return canonicalValue(Math.max(0, Number.isFinite(value) ? value : 0)); }
function canonicalUnitInterval(value: number): number { return canonicalValue(clamp(Number.isFinite(value) ? value : 0, 0, 1)); }
function finiteNonNegative(value: number): number { return Number.isFinite(value) ? Math.max(0, value) : 0; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
