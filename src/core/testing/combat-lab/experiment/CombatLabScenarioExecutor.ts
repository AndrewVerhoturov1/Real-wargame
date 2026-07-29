import { executeCombatLabCommand } from '../CombatLabCommands';
import type {
  CombatLabCommandResultV1,
  CombatLabScriptCommandV1,
} from '../CombatLabContracts';
import type { SimulationState } from '../../../simulation/SimulationState';
import type {
  CombatLabActionV1,
  CombatLabExperimentV1,
  CombatLabScenarioRuntimeSnapshotV1,
  CombatLabScenarioRuntimeStatusV1,
  CombatLabScenarioStepV1,
  CombatLabStepRuntimeSnapshotV1,
  CombatLabStepRuntimeState,
  CombatLabTrackV1,
} from './CombatLabExperimentContracts';
import { validateCombatLabExperiment } from './CombatLabExperimentValidation';
import {
  evaluateCombatLabCondition,
  type CombatLabConditionContextV1,
} from './CombatLabScenarioConditions';
import {
  captureCombatLabCompletionObservation,
  evaluateCombatLabCompletion,
  type CombatLabCompletionObservationV1,
} from './CombatLabScenarioCompletion';

const MINIMUM_WAIT_RETRY_SECONDS = 0.25;
const EPSILON_SECONDS = 1e-9;

interface MutableStepRuntime {
  readonly trackId: string;
  readonly step: CombatLabScenarioStepV1;
  state: CombatLabStepRuntimeState;
  attempt: number;
  ownerToken: string | null;
  startedSeconds: number | null;
  completedSeconds: number | null;
  nextRetrySeconds: number | null;
  reasonCode: string | null;
  reasonRu: string | null;
  observation: CombatLabCompletionObservationV1 | null;
  breakpointReached: boolean;
}

interface CompiledCommand {
  readonly command: CombatLabScriptCommandV1 | null;
  readonly errorCode: string | null;
  readonly errorRu: string | null;
}

export class CombatLabScenarioExecutor {
  private readonly experiment: CombatLabExperimentV1;
  private readonly state: SimulationState;
  private readonly experimentStartedSeconds: number;
  private readonly runtimeByStepKey = new Map<string, MutableStepRuntime>();
  private readonly tracks: readonly CombatLabTrackV1[];
  private status: CombatLabScenarioRuntimeStatusV1 = 'idle';
  private success: boolean | null = null;
  private stopReasonCode: string | null = null;
  private stopReasonRu: string | null = null;
  private commandSequence = 0;

  static create(
    experiment: CombatLabExperimentV1,
    state: SimulationState,
  ): CombatLabScenarioExecutor {
    const issues = validateCombatLabExperiment(experiment);
    const errors = issues.filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      throw new Error(`Combat Lab experiment is invalid: ${errors.map((issue) => `${issue.path}: ${issue.messageRu}`).join('; ')}`);
    }
    return new CombatLabScenarioExecutor(experiment, state);
  }

  private constructor(experiment: CombatLabExperimentV1, state: SimulationState) {
    this.experiment = experiment;
    this.state = state;
    this.experimentStartedSeconds = state.simulationTimeSeconds;
    this.tracks = experiment.tracks;
    for (const track of this.tracks) {
      for (const step of track.steps) {
        const enabled = track.enabled && step.enabled;
        this.runtimeByStepKey.set(stepKey(track.trackId, step.stepId), {
          trackId: track.trackId,
          step,
          state: enabled ? 'pending' : 'skipped',
          attempt: 0,
          ownerToken: null,
          startedSeconds: null,
          completedSeconds: enabled ? null : state.simulationTimeSeconds,
          nextRetrySeconds: null,
          reasonCode: enabled ? null : 'combat_lab_step_disabled',
          reasonRu: enabled ? null : 'Шаг отключён в исходном эксперименте.',
          observation: null,
          breakpointReached: false,
        });
      }
    }
  }

  beforeSimulationStep(): readonly CombatLabCommandResultV1[] {
    if (this.isTerminal()) return [];
    if (this.status === 'idle') this.status = 'running';
    if (this.checkGlobalStopConditions()) return [];
    const results: CombatLabCommandResultV1[] = [];
    const phaseSnapshot = this.getSnapshot();

    for (const track of this.tracks) {
      const runtime = this.firstUnfinishedStep(track);
      if (!runtime) continue;
      if (runtime.state === 'running') continue;
      if (runtime.nextRetrySeconds !== null && this.state.simulationTimeSeconds + EPSILON_SECONDS < runtime.nextRetrySeconds) continue;

      if (runtime.state === 'paused_at_breakpoint') runtime.state = 'pending';
      if (runtime.startedSeconds !== null && this.stepTimedOut(runtime)) {
        this.handleTimeout(runtime);
        continue;
      }

      const conditionContext = this.conditionContext(runtime, phaseSnapshot);
      if (!evaluateCombatLabCondition(runtime.step.startCondition, conditionContext)) {
        runtime.state = 'waiting';
        runtime.reasonCode = 'combat_lab_start_condition_waiting';
        runtime.reasonRu = 'Ожидание условия начала шага.';
        continue;
      }
      if (runtime.step.breakpointBefore && !runtime.breakpointReached && runtime.attempt === 0) {
        runtime.breakpointReached = true;
        runtime.state = 'paused_at_breakpoint';
        runtime.reasonCode = 'combat_lab_breakpoint_reached';
        runtime.reasonRu = 'Выполнение остановлено перед шагом breakpoint.';
        continue;
      }

      const startedSeconds = this.state.simulationTimeSeconds;
      runtime.attempt += 1;
      runtime.startedSeconds ??= startedSeconds;
      runtime.nextRetrySeconds = null;
      runtime.reasonCode = null;
      runtime.reasonRu = null;

      if (runtime.step.action.kind === 'wait') {
        runtime.ownerToken = null;
        runtime.observation = captureCombatLabCompletionObservation(
          this.experiment,
          this.state,
          runtime.step.action,
          null,
          startedSeconds,
        );
        runtime.state = 'running';
        continue;
      }

      const compiled = this.compileCommand(runtime.step.action, runtime.step);
      if (!compiled.command) {
        this.handleAttemptFailure(runtime, compiled.errorCode ?? 'combat_lab_command_compile_failed', compiled.errorRu ?? 'Не удалось собрать производственную команду.', true);
        continue;
      }

      this.commandSequence += 1;
      const ownerId = `${this.experiment.experimentId}@${this.experiment.revision}:${runtime.trackId}:${runtime.step.stepId}:attempt:${runtime.attempt}`;
      const result = executeCombatLabCommand(this.state, compiled.command, {
        ownerId,
        commandSequence: this.commandSequence,
        interactive: false,
      });
      results.push(result);
      runtime.ownerToken = result.ownerToken;
      if (!result.accepted) {
        // Rejection under the `wait` policy is an availability probe, not a
        // completed production attempt. Keep repeat accounting for accepted
        // actions only while the step timeout still bounds the wait.
        if (runtime.step.failurePolicy === 'wait') runtime.attempt = Math.max(0, runtime.attempt - 1);
        this.handleAttemptFailure(runtime, result.reasonCode, result.reasonRu, true);
        continue;
      }
      runtime.observation = captureCombatLabCompletionObservation(
        this.experiment,
        this.state,
        runtime.step.action,
        result.ownerToken,
        startedSeconds,
      );
      runtime.state = 'running';
      runtime.reasonCode = result.reasonCode;
      runtime.reasonRu = result.reasonRu;
    }

    return results;
  }

  afterSimulationStep(): void {
    if (this.isTerminal()) return;
    if (this.status === 'idle') this.status = 'running';
    const phaseSnapshot = this.getSnapshot();

    for (const track of this.tracks) {
      const runtime = this.firstUnfinishedStep(track);
      if (!runtime || runtime.state !== 'running' || !runtime.observation) continue;
      const completion = evaluateCombatLabCompletion(
        runtime.step.action,
        runtime.step.completion,
        runtime.observation,
        this.conditionContext(runtime, phaseSnapshot),
      );
      if (completion.status === 'completed') {
        this.handleAttemptCompleted(runtime, completion.reasonCode, completion.reasonRu);
        continue;
      }
      if (completion.status === 'failed') {
        this.handleAttemptFailure(runtime, completion.reasonCode, completion.reasonRu, false);
        continue;
      }
      runtime.reasonCode = completion.reasonCode;
      runtime.reasonRu = completion.reasonRu;
      if (this.stepTimedOut(runtime)) {
        this.handleTimeout(runtime);
      }
    }

    this.checkGlobalStopConditions();
  }

  getSnapshot(): CombatLabScenarioRuntimeSnapshotV1 {
    const steps: CombatLabStepRuntimeSnapshotV1[] = [];
    for (const track of this.tracks) {
      for (const step of track.steps) {
        const runtime = this.requireRuntime(track.trackId, step.stepId);
        steps.push(Object.freeze({
          trackId: runtime.trackId,
          stepId: runtime.step.stepId,
          state: runtime.state,
          attempt: runtime.attempt,
          ownerToken: runtime.ownerToken,
          startedSeconds: runtime.startedSeconds,
          completedSeconds: runtime.completedSeconds,
          nextRetrySeconds: runtime.nextRetrySeconds,
          reasonCode: runtime.reasonCode,
          reasonRu: runtime.reasonRu,
        }));
      }
    }
    return Object.freeze({
      schemaVersion: 1,
      experimentId: this.experiment.experimentId,
      experimentRevision: this.experiment.revision,
      status: this.status,
      simulatedSeconds: canonicalSeconds(this.state.simulationTimeSeconds - this.experimentStartedSeconds),
      success: this.success,
      stopReasonCode: this.stopReasonCode,
      stopReasonRu: this.stopReasonRu,
      steps: Object.freeze(steps),
    });
  }

  stop(reasonCode: string, reasonRu: string): void {
    if (this.isTerminal()) return;
    this.status = 'stopped';
    this.success = this.evaluateSuccessCondition();
    this.stopReasonCode = reasonCode;
    this.stopReasonRu = reasonRu;
  }

  private compileCommand(action: CombatLabActionV1, step: CombatLabScenarioStepV1): CompiledCommand {
    const roleUnitId = (roleId: string): string | null => this.experiment.roles.find((role) => role.roleId === roleId)?.unitId ?? null;
    const missingRole = (roleId: string): CompiledCommand => ({ command: null, errorCode: 'combat_lab_command_role_missing', errorRu: `Роль «${roleId}» не назначена бойцу.` });
    if (action.kind === 'fire') {
      const shooterUnitId = roleUnitId(action.actorRoleId);
      if (!shooterUnitId) return missingRole(action.actorRoleId);
      let targetUnitId: string | null = null;
      let targetPointMetres: { readonly xMetres: number; readonly yMetres: number; readonly zMetres: number } | null = null;
      let targetRadiusMetres = action.targetRadiusMetres;
      if (action.target.kind === 'role') {
        targetUnitId = roleUnitId(action.target.roleId);
        if (!targetUnitId) return missingRole(action.target.roleId);
      } else {
        const markerId = action.target.markerId;
        const marker = this.experiment.markers.find((candidate) => candidate.markerId === markerId);
        if (!marker) return { command: null, errorCode: 'combat_lab_command_marker_missing', errorRu: `Метка «${markerId}» отсутствует.` };
        targetPointMetres = { xMetres: marker.xMetres, yMetres: marker.yMetres, zMetres: marker.zMetres };
        if (marker.kind === 'circle') targetRadiusMetres = Math.max(targetRadiusMetres, marker.radiusMetres);
      }
      return {
        command: {
          kind: 'fire',
          shooterUnitId,
          targetUnitId,
          targetPointMetres,
          mode: action.mode,
          targetRadiusMetres,
          minimumSolutionQuality: action.minimumSolutionQuality,
          minimumPerceptionQuality: action.minimumPerceptionQuality,
          forceFire: action.forceFire,
          accuracyOverrides: step.accuracyOverrides ?? this.experiment.defaults.accuracyOverrides,
        },
        errorCode: null,
        errorRu: null,
      };
    }
    if (action.kind === 'stop_fire') {
      const unitId = roleUnitId(action.actorRoleId);
      return unitId ? successCommand({ kind: 'cancel_fire', unitId }) : missingRole(action.actorRoleId);
    }
    if (action.kind === 'move') {
      const unitId = roleUnitId(action.actorRoleId);
      if (!unitId) return missingRole(action.actorRoleId);
      const marker = this.experiment.markers.find((candidate) => candidate.markerId === action.markerId);
      if (!marker) return { command: null, errorCode: 'combat_lab_command_marker_missing', errorRu: `Метка «${action.markerId}» отсутствует.` };
      const metresPerCell = Math.max(0.001, this.state.map.metersPerCell);
      return successCommand({ kind: 'move', unitId, targetGrid: { x: marker.xMetres / metresPerCell, y: marker.yMetres / metresPerCell } });
    }
    if (action.kind === 'posture') {
      const unitId = roleUnitId(action.actorRoleId);
      return unitId ? successCommand({ kind: 'posture', unitId, targetPosture: action.targetPosture }) : missingRole(action.actorRoleId);
    }
    if (action.kind === 'reload' || action.kind === 'deploy' || action.kind === 'undeploy') {
      const unitId = roleUnitId(action.actorRoleId);
      if (!unitId) return missingRole(action.actorRoleId);
      const helperUnitId = action.helperRoleId === null ? null : roleUnitId(action.helperRoleId);
      if (action.helperRoleId !== null && !helperUnitId) return missingRole(action.helperRoleId);
      return successCommand({ kind: action.kind, unitId, helperUnitId });
    }
    if (action.kind === 'transfer') {
      const sourceUnitId = roleUnitId(action.sourceRoleId);
      const targetUnitId = roleUnitId(action.targetRoleId);
      if (!sourceUnitId) return missingRole(action.sourceRoleId);
      if (!targetUnitId) return missingRole(action.targetRoleId);
      return successCommand({ kind: 'transfer', sourceUnitId, targetUnitId, requestedRounds: action.requestedRounds });
    }
    if (action.kind === 'first_aid') {
      const actorUnitId = roleUnitId(action.actorRoleId);
      const targetUnitId = roleUnitId(action.targetRoleId);
      if (!actorUnitId) return missingRole(action.actorRoleId);
      if (!targetUnitId) return missingRole(action.targetRoleId);
      return successCommand({ kind: 'first_aid', actorUnitId, targetUnitId, zone: action.zone });
    }
    return { command: null, errorCode: 'combat_lab_wait_has_no_command', errorRu: 'Ожидание не выдаёт производственную команду.' };
  }

  private handleAttemptCompleted(runtime: MutableStepRuntime, reasonCode: string, reasonRu: string): void {
    if (runtime.step.repeat.kind === 'until_condition') {
      if (evaluateCombatLabCondition(runtime.step.repeat.condition, this.conditionContext(runtime))) {
        this.completeStep(runtime, reasonCode, reasonRu);
        return;
      }
      if (runtime.attempt >= runtime.step.repeat.maximumAttempts) {
        this.handleAttemptFailure(runtime, 'combat_lab_repeat_attempts_exhausted', `Условие повтора не выполнено после ${runtime.attempt} попыток.`, false);
        return;
      }
      runtime.state = 'waiting';
      runtime.ownerToken = null;
      runtime.observation = null;
      runtime.nextRetrySeconds = this.state.simulationTimeSeconds + runtime.step.repeat.retryDelaySeconds;
      runtime.reasonCode = 'combat_lab_repeat_waiting';
      runtime.reasonRu = 'Ожидание следующей ограниченной попытки.';
      return;
    }
    this.completeStep(runtime, reasonCode, reasonRu);
  }

  private completeStep(runtime: MutableStepRuntime, reasonCode: string, reasonRu: string): void {
    runtime.state = 'completed';
    runtime.completedSeconds = this.state.simulationTimeSeconds;
    runtime.nextRetrySeconds = null;
    runtime.reasonCode = reasonCode;
    runtime.reasonRu = reasonRu;
    runtime.observation = null;
  }

  private handleAttemptFailure(runtime: MutableStepRuntime, reasonCode: string, reasonRu: string, commandRejected: boolean): void {
    if (runtime.step.failurePolicy === 'skip_step') {
      runtime.state = 'skipped';
      runtime.completedSeconds = this.state.simulationTimeSeconds;
      runtime.reasonCode = reasonCode;
      runtime.reasonRu = reasonRu;
      runtime.observation = null;
      return;
    }
    if (runtime.step.failurePolicy === 'wait' && !this.stepTimedOut(runtime)) {
      if (!commandRejected && runtime.attempt >= runtime.step.repeat.maximumAttempts) {
        this.failExperiment('combat_lab_repeat_attempts_exhausted', `Шаг «${runtime.step.stepId}» исчерпал maximumAttempts.`);
        runtime.state = 'failed';
        runtime.completedSeconds = this.state.simulationTimeSeconds;
        runtime.reasonCode = 'combat_lab_repeat_attempts_exhausted';
        runtime.reasonRu = `Шаг исчерпал ${runtime.attempt} попыток.`;
        return;
      }
      runtime.state = 'waiting';
      runtime.ownerToken = null;
      runtime.observation = null;
      runtime.nextRetrySeconds = this.state.simulationTimeSeconds + Math.max(MINIMUM_WAIT_RETRY_SECONDS, runtime.step.repeat.retryDelaySeconds);
      runtime.reasonCode = reasonCode;
      runtime.reasonRu = reasonRu;
      return;
    }
    runtime.state = 'failed';
    runtime.completedSeconds = this.state.simulationTimeSeconds;
    runtime.reasonCode = reasonCode;
    runtime.reasonRu = reasonRu;
    runtime.observation = null;
    this.failExperiment(reasonCode, `Шаг «${runtime.step.stepId}» завершился ошибкой: ${reasonRu}`);
  }

  private handleTimeout(runtime: MutableStepRuntime): void {
    const reasonCode = 'combat_lab_step_timeout';
    const reasonRu = `Шаг «${runtime.step.stepId}» превысил timeout ${runtime.step.timeoutSeconds} с.`;
    if (runtime.step.failurePolicy === 'skip_step') {
      runtime.state = 'skipped';
      runtime.completedSeconds = this.state.simulationTimeSeconds;
      runtime.reasonCode = reasonCode;
      runtime.reasonRu = reasonRu;
      runtime.observation = null;
      return;
    }
    runtime.state = 'failed';
    runtime.completedSeconds = this.state.simulationTimeSeconds;
    runtime.reasonCode = reasonCode;
    runtime.reasonRu = reasonRu;
    runtime.observation = null;
    this.failExperiment(reasonCode, reasonRu);
  }

  private checkGlobalStopConditions(): boolean {
    if (this.isTerminal()) return true;
    const maximumSeconds = this.experiment.stopCondition.maximumSimulationSeconds;
    if (this.state.simulationTimeSeconds - this.experimentStartedSeconds + EPSILON_SECONDS >= maximumSeconds) {
      this.finishExperiment('combat_lab_stop_time_reached', 'Достигнуто максимальное время эксперимента.');
      return true;
    }
    if (this.experiment.stopCondition.kind === 'condition' && evaluateCombatLabCondition(this.experiment.stopCondition.condition, this.rootConditionContext())) {
      this.finishExperiment('combat_lab_stop_condition_true', 'Условие остановки эксперимента выполнено.');
      return true;
    }
    if (this.experiment.stopCondition.kind === 'program_complete' && this.allTracksTerminal()) {
      this.finishExperiment('combat_lab_program_complete', 'Все дорожки эксперимента завершены.');
      return true;
    }
    return false;
  }

  private finishExperiment(reasonCode: string, reasonRu: string): void {
    this.status = 'completed';
    this.success = this.evaluateSuccessCondition();
    this.stopReasonCode = reasonCode;
    this.stopReasonRu = reasonRu;
  }
  private failExperiment(reasonCode: string, reasonRu: string): void {
    this.status = 'failed';
    this.success = false;
    this.stopReasonCode = reasonCode;
    this.stopReasonRu = reasonRu;
  }
  private evaluateSuccessCondition(): boolean { return evaluateCombatLabCondition(this.experiment.successCondition, this.rootConditionContext()); }
  private rootConditionContext(): CombatLabConditionContextV1 {
    return {
      experiment: this.experiment,
      state: this.state,
      runtimeSnapshot: this.getSnapshot(),
      experimentStartedSeconds: this.experimentStartedSeconds,
      stepStartedSeconds: null,
    };
  }
  private conditionContext(
    runtime: MutableStepRuntime,
    runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1 = this.getSnapshot(),
  ): CombatLabConditionContextV1 {
    return {
      experiment: this.experiment,
      state: this.state,
      runtimeSnapshot,
      experimentStartedSeconds: this.experimentStartedSeconds,
      stepStartedSeconds: runtime.observation?.startedSeconds ?? runtime.startedSeconds,
    };
  }
  private stepTimedOut(runtime: MutableStepRuntime): boolean {
    return runtime.startedSeconds !== null
      && this.state.simulationTimeSeconds - runtime.startedSeconds + EPSILON_SECONDS >= runtime.step.timeoutSeconds;
  }
  private firstUnfinishedStep(track: CombatLabTrackV1): MutableStepRuntime | null {
    for (const step of track.steps) {
      const runtime = this.requireRuntime(track.trackId, step.stepId);
      if (!isStepTerminal(runtime.state)) return runtime;
    }
    return null;
  }
  private allTracksTerminal(): boolean {
    for (const runtime of this.runtimeByStepKey.values()) if (!isStepTerminal(runtime.state)) return false;
    return true;
  }
  private requireRuntime(trackId: string, stepId: string): MutableStepRuntime {
    const runtime = this.runtimeByStepKey.get(stepKey(trackId, stepId));
    if (!runtime) throw new Error(`Combat Lab runtime step is missing: ${trackId}/${stepId}`);
    return runtime;
  }
  private isTerminal(): boolean { return this.status === 'completed' || this.status === 'failed' || this.status === 'stopped'; }
}

function successCommand(command: CombatLabScriptCommandV1): CompiledCommand { return { command, errorCode: null, errorRu: null }; }
function stepKey(trackId: string, stepId: string): string { return `${trackId}/${stepId}`; }
function isStepTerminal(state: CombatLabStepRuntimeState): boolean { return state === 'completed' || state === 'failed' || state === 'skipped'; }
function canonicalSeconds(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000) / 1_000_000_000; }
