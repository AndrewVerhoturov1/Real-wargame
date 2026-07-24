import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  beginFireTaskRecovery,
  failActiveFireTask,
  tickFireTaskWithTimeBudget,
} from './FireTaskRuntime';
import type { FireTaskRuntimeV1, InfantryWeaponInstanceV1, ShotCommitStatus } from './InfantryCombatRuntimeTypes';
import { tickReferenceProjectiles } from './ReferenceProjectileStepper';
import { commitShot, type CommitShotResult } from './ShotCommitService';

const TIME_EPSILON_SECONDS = 1e-9;
const COMMIT_CANONICAL_SCALE = 1_000_000_000_000;

export interface TickInfantryCombatSimulationInput {
  readonly intervalStartSeconds: number;
  readonly deltaSeconds: number;
}

export interface TickInfantryCombatSimulationResult {
  readonly commitResults: readonly CommitShotResult[];
  readonly projectileSubsteps: number;
}

interface PendingCommit {
  readonly unit: UnitModel;
  readonly task: FireTaskRuntimeV1;
  readonly weapon: InfantryWeaponInstanceV1;
  readonly offsetSeconds: number;
}

interface PendingRecovery {
  readonly unit: UnitModel;
  readonly intervalStartSeconds: number;
  readonly deltaSeconds: number;
}

/**
 * Explicit Stage 5 combat pipeline. It never selects targets or creates tasks.
 * Tracking reads only the active task and the shooter's perception knowledge.
 */
export function tickInfantryCombatSimulation(
  state: SimulationState,
  input: TickInfantryCombatSimulationInput,
): TickInfantryCombatSimulationResult {
  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds);
  const deltaSeconds = finiteNonNegative(input.deltaSeconds);
  const units: UnitModel[] = [];
  for (const unit of state.units) {
    if (unit.infantryCombatRuntime.activeFireTask) units.push(unit);
  }
  units.sort(compareUnits);
  const pendingCommits: PendingCommit[] = [];
  const recoveries = new Map<string, PendingRecovery>();

  for (const unit of units) {
    const taskAtStart = unit.infantryCombatRuntime.activeFireTask;
    if (!taskAtStart) continue;
    if (taskAtStart.phase === 'recovery') {
      recoveries.set(unit.id, { unit, intervalStartSeconds, deltaSeconds });
      continue;
    }

    const ticked = tickFireTaskWithTimeBudget(unit, { intervalStartSeconds, deltaSeconds, state });
    if (!ticked.commitRequested) continue;
    const task = unit.infantryCombatRuntime.activeFireTask;
    const weapon = unit.infantryCombatRuntime.primaryWeapon;
    if (!task || !weapon || task.taskId !== ticked.taskId) continue;
    pendingCommits.push({
      unit,
      task,
      weapon,
      offsetSeconds: clamp(ticked.consumedSeconds, 0, deltaSeconds),
    });
  }

  pendingCommits.sort(comparePendingCommits);
  const commitResults: CommitShotResult[] = [];
  let projectileSubsteps = 0;
  let cursorSeconds = 0;

  for (const pending of pendingCommits) {
    const offsetSeconds = Math.max(cursorSeconds, pending.offsetSeconds);
    if (offsetSeconds > cursorSeconds + TIME_EPSILON_SECONDS) {
      projectileSubsteps += tickReferenceProjectiles(state, {
        intervalStartSeconds: intervalStartSeconds + cursorSeconds,
        deltaSeconds: offsetSeconds - cursorSeconds,
      }).executedSubsteps;
    }

    const committedSeconds = intervalStartSeconds + offsetSeconds;
    canonicalizeCommitAimSolution(pending.task);
    const result = commitShot({
      state,
      shooter: pending.unit,
      task: pending.task,
      weapon: pending.weapon,
      committedSeconds,
    });
    commitResults.push(result);
    if (result.status === 'committed' || result.status === 'already_committed') {
      if (pending.task.phase === 'firing' && result.shotId) {
        beginFireTaskRecovery(pending.unit, {
          committedShotId: result.shotId,
          startedSeconds: committedSeconds,
        });
      }
      recoveries.set(pending.unit.id, {
        unit: pending.unit,
        intervalStartSeconds: committedSeconds,
        deltaSeconds: Math.max(0, deltaSeconds - offsetSeconds),
      });
    } else {
      terminalizeCommitFailure(pending.unit, result.status, committedSeconds);
    }
    cursorSeconds = offsetSeconds;
  }

  if (deltaSeconds > cursorSeconds + TIME_EPSILON_SECONDS || pendingCommits.length === 0) {
    projectileSubsteps += tickReferenceProjectiles(state, {
      intervalStartSeconds: intervalStartSeconds + cursorSeconds,
      deltaSeconds: Math.max(0, deltaSeconds - cursorSeconds),
    }).executedSubsteps;
  }

  for (const recovery of [...recoveries.values()].sort((left, right) => compareText(left.unit.id, right.unit.id))) {
    if (recovery.deltaSeconds <= TIME_EPSILON_SECONDS) continue;
    if (recovery.unit.infantryCombatRuntime.activeFireTask?.phase !== 'recovery') continue;
    tickFireTaskWithTimeBudget(recovery.unit, {
      intervalStartSeconds: recovery.intervalStartSeconds,
      deltaSeconds: recovery.deltaSeconds,
    });
  }

  return { commitResults, projectileSubsteps };
}

/**
 * Continuous aiming can reach the same physical commitment event through
 * slightly different floating-point partitions. Canonicalize every value that
 * becomes immutable shot truth at the commitment boundary. This preserves the
 * continuous runtime while making the committed record and projectile exact.
 */
function canonicalizeCommitAimSolution(task: FireTaskRuntimeV1): void {
  const solution = task.aimTracking.solution;
  const direction = solution.currentDirection;
  if (Number.isFinite(direction.x) && Number.isFinite(direction.y) && Number.isFinite(direction.z)) {
    const magnitude = Math.hypot(direction.x, direction.y, direction.z);
    if (magnitude > TIME_EPSILON_SECONDS) {
      const rounded = {
        x: canonicalValue(direction.x / magnitude),
        y: canonicalValue(direction.y / magnitude),
        z: canonicalValue(direction.z / magnitude),
      };
      const roundedMagnitude = Math.hypot(rounded.x, rounded.y, rounded.z);
      if (roundedMagnitude > TIME_EPSILON_SECONDS) {
        solution.currentDirection = {
          x: rounded.x / roundedMagnitude,
          y: rounded.y / roundedMagnitude,
          z: rounded.z / roundedMagnitude,
        };
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
    || status === 'invalid_projectile_candidate';
}

function commitFailureText(status: Exclude<ShotCommitStatus, 'committed' | 'already_committed'>): string {
  if (status === 'empty_weapon') return 'Одиночный выстрел отклонён: в винтовке нет патрона.';
  if (status === 'aim_solution_invalid') return 'Одиночный выстрел отклонён: решение прицеливания недействительно.';
  if (status === 'aim_solution_below_threshold') return 'Одиночный выстрел отклонён: качество решения ниже заданного порога.';
  if (status === 'movement_forbidden') return 'Одиночный выстрел отклонён: это оружие запрещает огонь во время фактического движения.';
  if (status === 'muzzle_blocked') return 'Одиночный выстрел отклонён: дульный срез перекрыт.';
  if (status === 'friendly_risk_exceeded') return 'Одиночный выстрел отклонён: превышен допустимый риск для союзника.';
  if (status === 'projectile_capacity_exceeded') return 'Одиночный выстрел отклонён: заполнен ограниченный пул физических пуль.';
  if (status === 'duplicate_projectile_id') return 'Одиночный выстрел отклонён: обнаружен повторный идентификатор пули.';
  if (status === 'invalid_projectile_candidate') return 'Одиночный выстрел отклонён: состояние новой пули неверно.';
  if (status === 'unsupported_mode') return 'Одиночный выстрел отклонён: режим оружия не поддерживается Stage 5.';
  if (status === 'ownership_lost') return 'Огневая задача завершилась ошибкой: потерян точный захват канала оружия.';
  if (status === 'weapon_missing') return 'Огневая задача завершилась ошибкой: экземпляр винтовки отсутствует.';
  if (status === 'invalid_target') return 'Огневая задача завершилась ошибкой: направление решения прицеливания неверно.';
  return 'Огневая задача завершилась ошибкой до атомарного выстрела.';
}

function comparePendingCommits(left: PendingCommit, right: PendingCommit): number {
  return left.offsetSeconds - right.offsetSeconds || compareText(left.task.taskId, right.task.taskId);
}

function compareUnits(left: UnitModel, right: UnitModel): number {
  return compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value: number): number {
  return Math.round(value * COMMIT_CANONICAL_SCALE) / COMMIT_CANONICAL_SCALE;
}

function canonicalNonNegative(value: number): number {
  return canonicalValue(Math.max(0, Number.isFinite(value) ? value : 0));
}

function canonicalUnitInterval(value: number): number {
  return canonicalValue(clamp(Number.isFinite(value) ? value : 0, 0, 1));
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
