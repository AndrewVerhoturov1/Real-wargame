import { tickSimulation } from '../../core/simulation/SimulationTick';
import type { SimulationState } from '../../core/simulation/SimulationState';
import {
  COMBAT_LAB_FIXED_STEP_SECONDS,
  applyDueCombatLabProgramSteps,
  buildCombatLabInitialState,
  createCombatLabMetricCollector,
  digestCombatLabEvents,
  digestCombatLabState,
  executeCombatLabCommand,
  finalizeCombatLabMetrics,
  getCombatLabScenarioDefinition,
  observeCombatLabMetrics,
  type CombatLabBuiltScenarioV1,
  type CombatLabCommandResultV1,
  type CombatLabMetricCollectorV1,
  type CombatLabProgramRuntimeV1,
  type CombatLabScriptCommandV1,
} from '../../core/testing/combat-lab';
import { createCombatLabCheckpoint, restoreCombatLabCheckpoint, type CombatLabCheckpointV1 } from './CombatLabCheckpoint';

export const COMBAT_LAB_VISUAL_SPEEDS = [0.25, 0.5, 1, 2, 4, 10] as const;
const MAX_ACCUMULATED_SECONDS = 0.5;
const MAX_JOURNAL_ENTRIES = 256;

interface CombatLabVisualCheckpointBookkeepingV1 {
  readonly metrics: CombatLabMetricCollectorV1;
  readonly appliedStepIds: readonly string[];
  readonly nextStepIndex: number;
  readonly lastProgramCommandResult: CombatLabCommandResultV1 | null;
  readonly lastCommandResult: CombatLabCommandResultV1 | null;
  readonly commandSequence: number;
}

export interface CombatLabVisualSnapshotV1 {
  readonly scenarioId: string;
  readonly scenarioRevision: number;
  readonly seed: number;
  readonly simulatedSeconds: number;
  readonly paused: boolean;
  readonly speed: number;
  readonly interactive: boolean;
  readonly programEnabled: boolean;
  readonly lastCommandResult: CombatLabCommandResultV1 | null;
  readonly metrics: Record<string, number>;
  readonly eventDigest: string;
  readonly finalStateDigest: string;
  readonly checkpointAvailable: boolean;
  readonly eventJournal: readonly string[];
}

export class CombatLabVisualSession {
  private built: CombatLabBuiltScenarioV1;
  private metrics: CombatLabMetricCollectorV1;
  private readonly program: CombatLabProgramRuntimeV1 = { appliedStepIds: new Set(), nextStepIndex: 0, lastCommandResult: null };
  private paused = true;
  private speed = 1;
  private interactive = false;
  private programEnabled = false;
  private sequence = 0;
  private accumulatorSeconds = 0;
  private checkpoint: CombatLabCheckpointV1 | null = null;
  private checkpointBookkeeping: CombatLabVisualCheckpointBookkeepingV1 | null = null;
  private lastCommandResult: CombatLabCommandResultV1 | null = null;
  private readonly journal: string[] = [];
  private observedShots = 0;
  private observedImpacts = 0;
  private stateRevision = 0;

  constructor(scenarioId: string, seed: number) {
    const definition = getCombatLabScenarioDefinition(scenarioId);
    this.built = buildCombatLabInitialState(scenarioId, definition.revision, seed);
    this.metrics = createCombatLabMetricCollector(this.built.state);
    this.resetCounters();
    this.log(`Загружен стенд ${scenarioId}@${definition.revision}, seed ${seed}.`);
  }

  get state(): SimulationState { return this.built.state; }
  get definition() { return this.built.definition; }
  get seed(): number { return this.built.seed; }
  get revision(): number { return this.stateRevision; }

  startNewRun(scenarioId: string, seed: number): void {
    const definition = getCombatLabScenarioDefinition(scenarioId);
    const stableState = this.built.state;
    const nextBuilt = buildCombatLabInitialState(scenarioId, definition.revision, seed);
    replaceCombatLabStateInPlace(stableState, nextBuilt.state);
    this.built = { ...nextBuilt, state: stableState };
    this.stateRevision += 1;
    this.metrics = createCombatLabMetricCollector(this.state);
    this.program.appliedStepIds.clear();
    this.program.nextStepIndex = 0;
    this.program.lastCommandResult = null;
    this.paused = true;
    this.speed = 1;
    this.interactive = false;
    this.programEnabled = false;
    this.sequence = 0;
    this.accumulatorSeconds = 0;
    this.checkpoint = null;
    this.checkpointBookkeeping = null;
    this.lastCommandResult = null;
    this.journal.length = 0;
    this.resetCounters();
    this.log(`Новый чистый visual run: ${scenarioId}@${definition.revision}, seed ${seed}.`);
  }

  setPaused(value: boolean): void { this.paused = value; }
  togglePaused(): void { this.paused = !this.paused; }
  isPaused(): boolean { return this.paused; }

  setSpeed(value: number): void {
    if (!COMBAT_LAB_VISUAL_SPEEDS.includes(value as (typeof COMBAT_LAB_VISUAL_SPEEDS)[number])) {
      throw new Error(`Unsupported Combat Lab speed: ${value}`);
    }
    this.speed = value;
  }

  advance(realDeltaSeconds: number): boolean {
    if (this.paused) return false;
    this.accumulatorSeconds += Math.min(MAX_ACCUMULATED_SECONDS, Math.max(0, realDeltaSeconds * this.speed));
    let changed = false;
    while (this.accumulatorSeconds + 1e-9 >= COMBAT_LAB_FIXED_STEP_SECONDS) {
      this.advanceOneStep();
      this.accumulatorSeconds -= COMBAT_LAB_FIXED_STEP_SECONDS;
      changed = true;
    }
    return changed;
  }

  stepOnce(): void { this.advanceOneStep(); }
  enableRecommendedProgram(value: boolean): void { this.programEnabled = value; }

  executeInteractive(command: CombatLabScriptCommandV1): CombatLabCommandResultV1 {
    this.markInteractive();
    this.sequence += 1;
    const result = executeCombatLabCommand(this.state, command, {
      ownerId: `interactive:${this.definition.scenarioId}@${this.definition.revision}`,
      commandSequence: this.sequence,
      interactive: true,
    });
    this.lastCommandResult = result;
    this.log(`${result.accepted ? 'Принято' : 'Отказ'}: ${result.reasonRu} [${result.reasonCode}]`);
    return result;
  }

  markInteractive(): void {
    if (this.interactive) return;
    this.interactive = true;
    this.log('Прогон помечен как interactive после команды пользователя.');
  }

  saveCheckpoint(): void {
    this.checkpoint = createCombatLabCheckpoint(this.state, {
      scenarioId: this.definition.scenarioId,
      scenarioRevision: this.definition.revision,
      seed: this.seed,
      interactive: this.interactive,
    });
    this.checkpointBookkeeping = {
      metrics: { ...this.metrics },
      appliedStepIds: [...this.program.appliedStepIds],
      nextStepIndex: this.program.nextStepIndex,
      lastProgramCommandResult: this.program.lastCommandResult,
      lastCommandResult: this.lastCommandResult,
      commandSequence: this.sequence,
    };
    this.log('Контрольная точка сохранена каноническим экспортом сцены.');
  }

  restoreCheckpoint(): boolean {
    if (!this.checkpoint || !this.checkpointBookkeeping) return false;
    restoreCombatLabCheckpoint(this.state, this.checkpoint);
    this.stateRevision += 1;
    this.interactive = this.checkpoint.interactive;
    this.accumulatorSeconds = 0;
    this.programEnabled = false;
    this.metrics = { ...this.checkpointBookkeeping.metrics };
    this.program.appliedStepIds.clear();
    for (const stepId of this.checkpointBookkeeping.appliedStepIds) this.program.appliedStepIds.add(stepId);
    this.program.nextStepIndex = this.checkpointBookkeeping.nextStepIndex;
    this.program.lastCommandResult = this.checkpointBookkeeping.lastProgramCommandResult;
    this.lastCommandResult = this.checkpointBookkeeping.lastCommandResult;
    this.sequence = this.checkpointBookkeeping.commandSequence;
    this.resetCounters();
    this.log('Контрольная точка восстановлена; production reconciliation выполнен.');
    return true;
  }

  deleteCheckpoint(): void {
    this.checkpoint = null;
    this.checkpointBookkeeping = null;
  }

  getSnapshot(): CombatLabVisualSnapshotV1 {
    return {
      scenarioId: this.definition.scenarioId,
      scenarioRevision: this.definition.revision,
      seed: this.seed,
      simulatedSeconds: this.state.simulationTimeSeconds,
      paused: this.paused,
      speed: this.speed,
      interactive: this.interactive,
      programEnabled: this.programEnabled,
      lastCommandResult: this.lastCommandResult,
      metrics: finalizeCombatLabMetrics(this.state, this.metrics),
      eventDigest: digestCombatLabEvents(this.state),
      finalStateDigest: digestCombatLabState(this.state),
      checkpointAvailable: this.checkpoint !== null,
      eventJournal: [...this.journal],
    };
  }

  private advanceOneStep(): void {
    if (this.programEnabled) {
      for (const result of applyDueCombatLabProgramSteps(this.state, this.definition, this.program)) {
        this.lastCommandResult = result;
        this.log(`${result.accepted ? 'Сценарий' : 'Отказ сценария'}: ${result.reasonRu}`);
      }
    }
    tickSimulation(this.state, COMBAT_LAB_FIXED_STEP_SECONDS);
    observeCombatLabMetrics(this.state, this.metrics);
    this.captureProductionEvents();
  }

  private captureProductionEvents(): void {
    const runtime = this.state.infantryCombatProjectiles;
    for (let index = this.observedShots; index < runtime.committedShots.length; index += 1) {
      const shot = runtime.committedShots[index]!;
      this.log(`Выстрел ${shot.shotId}: ${shot.roundsBefore}→${shot.roundsAfter} патронов.`);
    }
    for (let index = this.observedImpacts; index < runtime.impacts.length; index += 1) {
      const impact = runtime.impacts[index]!;
      this.log(`Impact ${impact.impactId}: ${impact.hitType}${impact.hitUnitId ? `, ${impact.hitUnitId}/${impact.hitZone ?? 'без зоны'}` : ''}.`);
    }
    this.observedShots = runtime.committedShots.length;
    this.observedImpacts = runtime.impacts.length;
  }

  private resetCounters(): void {
    this.observedShots = this.state.infantryCombatProjectiles.committedShots.length;
    this.observedImpacts = this.state.infantryCombatProjectiles.impacts.length;
  }

  private log(message: string): void {
    this.journal.push(`${this.state.simulationTimeSeconds.toFixed(3)} с — ${message}`);
    if (this.journal.length > MAX_JOURNAL_ENTRIES) this.journal.splice(0, this.journal.length - MAX_JOURNAL_ENTRIES);
  }
}

export function replaceCombatLabStateInPlace(target: SimulationState, source: SimulationState): void {
  for (const key of Object.keys(target) as Array<keyof SimulationState>) {
    if (!(key in source)) delete (target as unknown as Record<string, unknown>)[key as string];
  }
  Object.assign(target, source);
}
