import {
  CombatLabScenarioExecutor,
  prepareCombatLabExperimentForRun,
  type CombatLabCommandResultV1,
  type CombatLabExperimentV1,
  type CombatLabScenarioRuntimeSnapshotV1,
} from '../../core/testing/combat-lab';
import {
  COMBAT_LAB_VISUAL_SPEEDS,
  type CombatLabVisualSession,
  type CombatLabVisualStepHooks,
} from './CombatLabVisualSession';
import {
  CombatLabExperimentRunJournal,
  buildCombatLabExperimentVisualSnapshot,
  type CombatLabExperimentVisualRuntimeSnapshotV1,
  type CombatLabExperimentVisualStatusV1,
  type CombatLabRepresentativeReplayContextV1,
} from './CombatLabExperimentRunState';

export interface CombatLabExperimentVisualControllerOptions {
  readonly session: CombatLabVisualSession;
  readonly getExperiment: () => CombatLabExperimentV1;
  readonly onRuntimeChanged: (snapshot: CombatLabScenarioRuntimeSnapshotV1) => void;
}

export class CombatLabExperimentVisualController implements CombatLabVisualStepHooks {
  private readonly journal = new CombatLabExperimentRunJournal();
  private executor: CombatLabScenarioExecutor | null = null;
  private experiment: CombatLabExperimentV1 | null = null;
  private selectedSeed = 1;
  private visualRevision = 0;
  private visualStatus: CombatLabExperimentVisualStatusV1 = 'ready';
  private blockedBeforeTick = false;
  private representative: CombatLabRepresentativeReplayContextV1 | null = null;
  private publishedSnapshot: CombatLabExperimentVisualRuntimeSnapshotV1 | null = null;
  private destroyed = false;

  private constructor(private readonly options: CombatLabExperimentVisualControllerOptions) {}

  static create(options: CombatLabExperimentVisualControllerOptions): CombatLabExperimentVisualController {
    const controller = new CombatLabExperimentVisualController(options);
    options.session.setStepHooks(controller, controller);
    controller.reset();
    return controller;
  }

  reset(seed?: number): void {
    this.assertAlive();
    const sourceExperiment = this.options.getExperiment();
    this.cancelCurrentExperimentActions();
    this.selectedSeed = normalizeSeed(seed ?? sourceExperiment.defaults.seed);
    const experiment = prepareCombatLabExperimentForRun(sourceExperiment, this.selectedSeed);
    this.options.session.enableRecommendedProgram(false);
    this.options.session.setPaused(true);
    this.options.session.resetExperimentScene(experiment.sceneSnapshot, this.selectedSeed);
    this.experiment = experiment;
    const executor = CombatLabScenarioExecutor.create(experiment, this.options.session.state);
    this.executor = executor;
    this.visualRevision += 1;
    this.visualStatus = 'ready';
    this.blockedBeforeTick = false;
    this.representative = null;
    this.journal.clear();
    const core = executor.getSnapshot();
    this.publish(core);
  }

  start(): void {
    this.assertAlive();
    if (this.refreshExecutorForChangedExperiment()) return this.start();
    const snapshot = this.requireExecutor().getSnapshot();
    if (isTerminal(snapshot)) return;
    this.blockedBeforeTick = false;
    this.visualStatus = 'running';
    this.options.session.setPaused(false);
    this.publish(snapshot);
  }

  pause(): void {
    this.assertAlive();
    if (this.refreshExecutorForChangedExperiment()) return;
    const snapshot = this.requireExecutor().getSnapshot();
    if (isTerminal(snapshot)) return;
    this.options.session.setPaused(true);
    this.visualStatus = snapshot.status === 'idle' ? 'ready' : 'paused';
    this.publish(snapshot);
  }

  stop(): void {
    this.assertAlive();
    if (this.refreshExecutorForChangedExperiment()) return;
    const executor = this.requireExecutor();
    const previous = executor.getSnapshot();
    this.cancelOwnedActions(previous);
    executor.stop('combat_lab_visual_stopped', 'Визуальный прогон остановлен пользователем.');
    const next = executor.getSnapshot();
    this.recordTransitions(previous, next);
    this.options.session.setPaused(true);
    this.blockedBeforeTick = true;
    this.visualStatus = 'stopped';
    this.publish(next);
  }

  stepOnce(): void {
    this.assertAlive();
    if (this.refreshExecutorForChangedExperiment()) return this.stepOnce();
    const snapshot = this.requireExecutor().getSnapshot();
    if (isTerminal(snapshot)) return;
    this.options.session.setPaused(true);
    this.visualStatus = 'paused';
    let advanced = this.options.session.stepOnce();
    if (!advanced && this.blockedBeforeTick) {
      this.blockedBeforeTick = false;
      advanced = this.options.session.stepOnce();
    }
    const next = this.requireExecutor().getSnapshot();
    this.options.session.setPaused(true);
    if (!isTerminal(next)) this.visualStatus = 'paused';
    if (!advanced && !isTerminal(next)) this.publish(next);
  }

  beforeSimulationStep(): void {
    if (this.destroyed) return;
    if (this.refreshExecutorForChangedExperiment()) {
      this.blockedBeforeTick = true;
      return;
    }
    const executor = this.requireExecutor();
    const previous = executor.getSnapshot();
    this.blockedBeforeTick = false;
    const results = executor.beforeSimulationStep();
    const next = executor.getSnapshot();
    this.recordTransitions(previous, next, results);

    if (next.steps.some((step) => step.state === 'paused_at_breakpoint')) {
      this.blockedBeforeTick = true;
      this.options.session.setPaused(true);
      this.visualStatus = 'paused';
    } else if (isTerminal(next)) {
      this.blockedBeforeTick = true;
      this.options.session.setPaused(true);
      this.visualStatus = statusFromCore(next);
    } else {
      this.visualStatus = 'running';
    }
    this.publish(next);
  }

  shouldAdvanceSimulationStep(): boolean {
    return !this.blockedBeforeTick;
  }

  afterSimulationStep(): void {
    if (this.destroyed || !this.executor) return;
    const previous = this.executor.getSnapshot();
    this.executor.afterSimulationStep();
    const next = this.executor.getSnapshot();
    this.recordTransitions(previous, next);
    if (isTerminal(next)) {
      this.options.session.setPaused(true);
      this.visualStatus = statusFromCore(next);
    } else if (this.options.session.isPaused()) {
      this.visualStatus = 'paused';
    } else {
      this.visualStatus = 'running';
    }
    this.publish(next);
  }

  getSnapshot(): CombatLabScenarioRuntimeSnapshotV1 {
    this.assertAlive();
    if (this.refreshExecutorForChangedExperiment()) return this.requirePublishedSnapshot();
    return this.requirePublishedSnapshot();
  }

  setSpeed(value: number): void {
    this.assertAlive();
    this.options.session.setSpeed(value);
    this.publish(this.requireExecutor().getSnapshot());
  }

  getSpeed(): number {
    return this.options.session.getSpeed();
  }

  getAvailableSpeeds(): readonly number[] {
    return COMBAT_LAB_VISUAL_SPEEDS;
  }

  setRepresentativeContext(context: CombatLabRepresentativeReplayContextV1 | null): void {
    this.assertAlive();
    this.representative = context ? Object.freeze({ ...context }) : null;
    this.publish(this.requireExecutor().getSnapshot());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.cancelCurrentExperimentActions();
    this.options.session.setPaused(true);
    this.options.session.clearStepHooks(this);
    this.destroyed = true;
    this.executor = null;
    this.experiment = null;
    this.publishedSnapshot = null;
  }

  private recordTransitions(
    previous: CombatLabScenarioRuntimeSnapshotV1,
    next: CombatLabScenarioRuntimeSnapshotV1,
    results: readonly CombatLabCommandResultV1[] = [],
  ): void {
    const experiment = this.requireExperiment();
    for (const entry of this.journal.recordTransitions(experiment, previous, next, results)) {
      this.options.session.appendRunJournal(entry.messageRu);
    }
  }

  private publish(core: CombatLabScenarioRuntimeSnapshotV1): void {
    const snapshot = buildCombatLabExperimentVisualSnapshot({
      core,
      experiment: this.requireExperiment(),
      seed: this.selectedSeed,
      visualRevision: this.visualRevision,
      visualStatus: this.visualStatus,
      speed: this.options.session.getSpeed(),
      journal: this.journal.snapshot(),
      representative: this.representative,
    });
    this.publishedSnapshot = snapshot;
    this.options.onRuntimeChanged(snapshot);
  }

  private refreshExecutorForChangedExperiment(): boolean {
    const current = this.options.getExperiment();
    if (this.experiment
      && current.experimentId === this.experiment.experimentId
      && current.revision === this.experiment.revision) return false;
    this.reset();
    return true;
  }

  private cancelCurrentExperimentActions(): void {
    if (!this.executor) return;
    this.cancelOwnedActions(this.executor.getSnapshot());
  }

  private cancelOwnedActions(snapshot: CombatLabScenarioRuntimeSnapshotV1): void {
    const ownerTokens = new Set<string>(
      snapshot.steps
        .map((step) => step.ownerToken)
        .filter((token): token is string => typeof token === 'string' && token.length > 0),
    );
    this.options.session.cancelActionsOwnedBy(ownerTokens);
  }

  private requireExecutor(): CombatLabScenarioExecutor {
    if (!this.executor) throw new Error('Combat Lab visual controller has no executor.');
    return this.executor;
  }

  private requireExperiment(): CombatLabExperimentV1 {
    if (!this.experiment) throw new Error('Combat Lab visual controller has no experiment.');
    return this.experiment;
  }

  private requirePublishedSnapshot(): CombatLabExperimentVisualRuntimeSnapshotV1 {
    if (!this.publishedSnapshot) throw new Error('Combat Lab visual controller has no runtime snapshot.');
    return this.publishedSnapshot;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Combat Lab visual controller is destroyed.');
  }
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const normalized = Math.trunc(seed) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

function isTerminal(snapshot: CombatLabScenarioRuntimeSnapshotV1): boolean {
  return snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'stopped';
}

function statusFromCore(snapshot: CombatLabScenarioRuntimeSnapshotV1): CombatLabExperimentVisualStatusV1 {
  if (snapshot.status === 'completed') return 'completed';
  if (snapshot.status === 'failed') return 'failed';
  if (snapshot.status === 'stopped') return 'stopped';
  return snapshot.status === 'running' ? 'running' : 'ready';
}
