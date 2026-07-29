import {
  cancelActiveFirstAidAction,
  cancelAmmoTransfer,
  cancelReloadWeapon,
  cancelSingleFireTask,
  cancelWeaponDeploymentAction,
  getEffectiveCombatCapabilities,
  type SuppressionEventKind,
  type WoundSeverity,
} from '../../core/infantry-combat/runtime';
import { tickSimulation } from '../../core/simulation/SimulationTick';
import type { SimulationState } from '../../core/simulation/SimulationState';
import type { UnitModel } from '../../core/units/UnitModel';
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
  preserveCombatLabTargetSurvivability,
  type CombatLabBuiltScenarioV1,
  type CombatLabCommandResultV1,
  type CombatLabMetricCollectorV1,
  type CombatLabProgramRuntimeV1,
  type CombatLabScriptCommandV1,
} from '../../core/testing/combat-lab';
import type { ExportedSceneData } from '../../ui/SceneExport';
import {
  createCombatLabCheckpoint,
  restoreCombatLabCheckpoint,
  restoreExportedScene,
  type CombatLabCheckpointV1,
} from './CombatLabCheckpoint';

export const COMBAT_LAB_VISUAL_SPEEDS = [0.25, 0.5, 1, 2, 4, 10] as const;
const MAX_ACCUMULATED_SECONDS = 0.5;
const MAX_JOURNAL_ENTRIES = 256;
const MAX_OBSERVED_SHOT_IDS = 4096;

export interface CombatLabVisualStepHooks {
  beforeSimulationStep(): void;
  afterSimulationStep(): void;
  shouldAdvanceSimulationStep(): boolean;
}

interface CombatLabVisualCheckpointBookkeepingV1 {
  readonly metrics: CombatLabMetricCollectorV1;
  readonly appliedStepIds: readonly string[];
  readonly nextStepIndex: number;
  readonly lastProgramCommandResult: CombatLabCommandResultV1 | null;
  readonly lastCommandResult: CombatLabCommandResultV1 | null;
  readonly commandSequence: number;
}

interface CombatLabObservedMoralStateV1 {
  readonly suppressionUpdateCount: number;
  readonly suppressionLevel: number;
  readonly stress: number;
  readonly morale: number;
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
  private experimentRuntimeActive = false;
  private sequence = 0;
  private accumulatorSeconds = 0;
  private checkpoint: CombatLabCheckpointV1 | null = null;
  private checkpointBookkeeping: CombatLabVisualCheckpointBookkeepingV1 | null = null;
  private lastCommandResult: CombatLabCommandResultV1 | null = null;
  private readonly journal: string[] = [];
  private observedShots = 0;
  private observedImpacts = 0;
  private observedTerminations = 0;
  private readonly shooterIdByShotId = new Map<string, string>();
  private readonly resolvedShotIds = new Set<string>();
  private readonly observedMoralStateByUnitId = new Map<string, CombatLabObservedMoralStateV1>();
  private stepHookOwner: object | null = null;
  private stepHooks: CombatLabVisualStepHooks | null = null;
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
    this.experimentRuntimeActive = false;
    this.resetRunBookkeeping(true);
    this.log(`Новый чистый visual run: ${scenarioId}@${definition.revision}, seed ${seed}.`);
  }

  resetExperimentScene(sceneSnapshot: ExportedSceneData, seed: number): void {
    const stableState = this.built.state;
    restoreExportedScene(stableState, sceneSnapshot);
    this.built = { ...this.built, state: stableState, seed: normalizeSeed(seed) };
    this.stateRevision += 1;
    this.experimentRuntimeActive = true;
    this.resetRunBookkeeping(false);
    this.log(`Сцена эксперимента восстановлена, seed ${this.seed}.`);
  }

  setStepHooks(owner: object, hooks: CombatLabVisualStepHooks): void {
    if (this.stepHookOwner && this.stepHookOwner !== owner) {
      throw new Error('Combat Lab visual step hooks already have an owner.');
    }
    this.stepHookOwner = owner;
    this.stepHooks = hooks;
  }

  clearStepHooks(owner: object): void {
    if (this.stepHookOwner !== owner) return;
    this.stepHookOwner = null;
    this.stepHooks = null;
  }

  setPaused(value: boolean): void { this.paused = value; }
  togglePaused(): void { this.paused = !this.paused; }
  isPaused(): boolean { return this.paused; }

  getSpeed(): number { return this.speed; }

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
      const advanced = this.advanceOneStep();
      if (!advanced) {
        this.accumulatorSeconds = 0;
        break;
      }
      this.accumulatorSeconds -= COMBAT_LAB_FIXED_STEP_SECONDS;
      changed = true;
    }
    return changed;
  }

  stepOnce(): boolean { return this.advanceOneStep(); }
  enableRecommendedProgram(value: boolean): void { this.programEnabled = value; }

  appendRunJournal(message: string): void {
    this.log(message);
  }

  cancelActionsOwnedBy(ownerTokens: ReadonlySet<string>): number {
    if (ownerTokens.size === 0) return 0;
    const endedSeconds = this.state.simulationTimeSeconds;
    const cancelledTransfers = new Set<string>();
    let cancelled = 0;
    for (const unit of this.state.units) {
      const task = unit.infantryCombatRuntime.activeFireTask;
      if (task && ownerTokens.has(task.ownerToken)) {
        const result = cancelSingleFireTask(unit, {
          ownerToken: task.ownerToken,
          endedSeconds,
          resultCode: 'combat_lab_experiment_stopped',
          resultRu: 'Огневая задача эксперимента остановлена.',
        });
        if (result.status === 'cancelled') cancelled += 1;
      }
      const reload = unit.infantryCombatRuntime.ammoInventory.activeReload;
      if (reload && ownerTokens.has(reload.ownerToken)) {
        if (cancelReloadWeapon(this.state, unit, reload.ownerToken, endedSeconds).status === 'cancelled') cancelled += 1;
      }
      const deployment = unit.infantryCombatRuntime.primaryWeapon?.deployment.activeAction;
      if (deployment && ownerTokens.has(deployment.ownerToken)) {
        if (cancelWeaponDeploymentAction(this.state, unit, deployment.ownerToken, endedSeconds).status === 'cancelled') cancelled += 1;
      }
      const transfer = unit.infantryCombatRuntime.ammoInventory.activeTransfer;
      if (transfer && ownerTokens.has(transfer.ownerToken) && !cancelledTransfers.has(transfer.actionId)) {
        cancelledTransfers.add(transfer.actionId);
        if (cancelAmmoTransfer(this.state, transfer.actionId, endedSeconds).status === 'cancelled') cancelled += 1;
      }
      const firstAid = unit.infantryCombatRuntime.medical.activeFirstAidAction;
      if (firstAid && ownerTokens.has(firstAid.ownerToken)) {
        if (cancelActiveFirstAidAction(
          unit,
          endedSeconds,
          'combat_lab_experiment_stopped',
          'Первая помощь эксперимента остановлена.',
        )) cancelled += 1;
      }
    }
    if (cancelled > 0) this.log(`Остановлено действий эксперимента: ${cancelled}.`);
    return cancelled;
  }

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
    return Object.freeze({
      scenarioId: this.definition.scenarioId,
      scenarioRevision: this.definition.revision,
      seed: this.seed,
      simulatedSeconds: this.state.simulationTimeSeconds,
      paused: this.paused,
      speed: this.speed,
      interactive: this.interactive,
      programEnabled: this.programEnabled,
      lastCommandResult: this.lastCommandResult,
      metrics: Object.freeze(finalizeCombatLabMetrics(this.state, this.metrics)),
      eventDigest: digestCombatLabEvents(this.state),
      finalStateDigest: digestCombatLabState(this.state),
      checkpointAvailable: this.checkpoint !== null,
      eventJournal: Object.freeze([...this.journal]),
    });
  }

  private resetRunBookkeeping(resetSpeed: boolean): void {
    this.metrics = createCombatLabMetricCollector(this.state);
    this.program.appliedStepIds.clear();
    this.program.nextStepIndex = 0;
    this.program.lastCommandResult = null;
    this.paused = true;
    if (resetSpeed) this.speed = 1;
    this.interactive = false;
    this.programEnabled = false;
    this.sequence = 0;
    this.accumulatorSeconds = 0;
    this.checkpoint = null;
    this.checkpointBookkeeping = null;
    this.lastCommandResult = null;
    this.journal.length = 0;
    this.resetCounters();
  }

  private advanceOneStep(): boolean {
    if (this.programEnabled) {
      for (const result of applyDueCombatLabProgramSteps(this.state, this.definition, this.program)) {
        this.lastCommandResult = result;
        this.log(`${result.accepted ? 'Сценарий' : 'Отказ сценария'}: ${result.reasonRu}`);
      }
    }
    const hooks = this.stepHooks;
    hooks?.beforeSimulationStep();
    if (hooks && !hooks.shouldAdvanceSimulationStep()) return false;
    tickSimulation(this.state, COMBAT_LAB_FIXED_STEP_SECONDS);
    hooks?.afterSimulationStep();
    if (!this.experimentRuntimeActive) preserveCombatLabTargetSurvivability(this.state, this.built.roles);
    observeCombatLabMetrics(this.state, this.metrics);
    this.captureProductionEvents();
    this.captureProductionMoralEffects();
    return true;
  }

  private captureProductionEvents(): void {
    const runtime = this.state.infantryCombatProjectiles;
    for (let index = this.observedShots; index < runtime.committedShots.length; index += 1) {
      const shot = runtime.committedShots[index]!;
      const shooter = findUnit(this.state, shot.shooterId);
      this.rememberShot(shot.shotId, shot.shooterId);
      const probability = shot.predictedHitProbability === undefined
        ? ''
        : `; расчётная вероятность ${Math.round(clamp01(shot.predictedHitProbability) * 100)}%`;
      this.log(`Стрелок: ${unitName(shooter, shot.shooterId)} — выстрел ${shot.shotId}; патроны ${shot.roundsBefore}→${shot.roundsAfter}${probability}.`);
    }
    for (let index = this.observedImpacts; index < runtime.impacts.length; index += 1) {
      const impact = runtime.impacts[index]!;
      const shooter = findUnit(this.state, impact.shooterId);
      this.markShotResolved(impact.shotId);
      if (!impact.hitUnitId) {
        const destination = impact.hitType === 'terrain'
          ? 'местность'
          : impact.hitType === 'object'
            ? `объект ${impact.hitObjectId ?? 'без идентификатора'}`
            : 'небоевую геометрию';
        this.log(`Стрелок: ${unitName(shooter, impact.shooterId)} — промах ${impact.shotId}; пуля попала в ${destination}.`);
        continue;
      }

      const victim = findUnit(this.state, impact.hitUnitId);
      const wound = victim?.infantryCombatRuntime.wounds.slots.find((slot) => slot.lastImpactId === impact.impactId) ?? null;
      const zone = hitZoneLabel(impact.hitZone);
      const penetration = impact.bodyPhysics?.status ? `, ${penetrationLabel(impact.bodyPhysics.status)}` : '';
      this.log(`Стрелок: ${unitName(shooter, impact.shooterId)} — попадание ${impact.shotId} в ${unitName(victim, impact.hitUnitId)}, зона ${zone}${penetration}.`);

      if (!victim) {
        this.log(`Жертва: ${impact.hitUnitId} — состояние недоступно: боец не найден.`);
        continue;
      }
      const blood = victim.infantryCombatRuntime.physiology.blood;
      const bloodRemainingPercent = Math.round((1 - clamp01(blood.bloodLoss)) * 100);
      const bleedingPercentPerSecond = Math.round(Math.max(0, blood.currentBleedingRatePerSecond) * 10_000) / 100;
      const woundDescription = wound
        ? `${severityLabel(wound.severity)} ранение, кровотечение ${bleedingStateLabel(wound.bleedingState)}`
        : 'зарегистрированное попадание без нового слота ранения';
      this.log(`Жертва: ${unitName(victim, victim.id)} — ${woundDescription}; кровь ${bloodRemainingPercent}%, потеря ${Math.round(clamp01(blood.bloodLoss) * 100)}%, темп ${bleedingPercentPerSecond}%/с; состояние ${effectiveConditionLabel(victim)}.`);
    }
    for (let index = this.observedTerminations; index < runtime.terminations.length; index += 1) {
      const termination = runtime.terminations[index]!;
      if (this.resolvedShotIds.has(termination.shotId)) continue;
      const shooterId = this.shooterIdByShotId.get(termination.shotId) ?? null;
      const shooter = shooterId ? findUnit(this.state, shooterId) : null;
      this.markShotResolved(termination.shotId);
      this.log(`Стрелок: ${shooterId ? unitName(shooter, shooterId) : 'не определён'} — промах ${termination.shotId}; ${terminationReasonLabel(termination.reason)}.`);
    }
    this.observedShots = runtime.committedShots.length;
    this.observedImpacts = runtime.impacts.length;
    this.observedTerminations = runtime.terminations.length;
  }

  private captureProductionMoralEffects(): void {
    for (const unit of this.state.units) {
      const current = moralStateSnapshot(unit);
      const previous = this.observedMoralStateByUnitId.get(unit.id) ?? current;
      const suppression = unit.infantryCombatRuntime.suppression;
      if (
        current.suppressionUpdateCount > previous.suppressionUpdateCount
        && suppression.lastAppliedImpulse > 0
      ) {
        const distance = suppression.recentImpactDistanceMetres === null
          ? ''
          : `; ближайшая пуля ${formatMetres(suppression.recentImpactDistanceMetres)} м`;
        this.log(
          `Моральное воздействие: ${unitName(unit, unit.id)} — ${suppressionEventLabel(suppression.lastEventKind)}${distance}; `
          + `подавление ${formatPercentTransition(previous.suppressionLevel * 100, current.suppressionLevel * 100)}; `
          + `стресс ${formatPercentTransition(previous.stress, current.stress)}; `
          + `боевой дух ${formatPercentTransition(previous.morale, current.morale)}.`,
        );
      }
      this.observedMoralStateByUnitId.set(unit.id, current);
    }
  }

  private resetCounters(): void {
    const runtime = this.state.infantryCombatProjectiles;
    this.observedShots = runtime.committedShots.length;
    this.observedImpacts = runtime.impacts.length;
    this.observedTerminations = runtime.terminations.length;
    this.shooterIdByShotId.clear();
    for (const shot of runtime.committedShots.slice(-MAX_OBSERVED_SHOT_IDS)) {
      this.rememberShot(shot.shotId, shot.shooterId);
    }
    this.resolvedShotIds.clear();
    for (const impact of runtime.impacts.slice(-MAX_OBSERVED_SHOT_IDS)) this.markShotResolved(impact.shotId);
    this.observedMoralStateByUnitId.clear();
    for (const unit of this.state.units) this.observedMoralStateByUnitId.set(unit.id, moralStateSnapshot(unit));
  }

  private rememberShot(shotId: string, shooterId: string): void {
    if (!this.shooterIdByShotId.has(shotId) && this.shooterIdByShotId.size >= MAX_OBSERVED_SHOT_IDS) {
      const oldest = this.shooterIdByShotId.keys().next().value as string | undefined;
      if (oldest !== undefined) this.shooterIdByShotId.delete(oldest);
    }
    this.shooterIdByShotId.set(shotId, shooterId);
  }

  private markShotResolved(shotId: string): void {
    if (this.resolvedShotIds.has(shotId)) return;
    if (this.resolvedShotIds.size >= MAX_OBSERVED_SHOT_IDS) {
      const oldest = this.resolvedShotIds.values().next().value as string | undefined;
      if (oldest !== undefined) this.resolvedShotIds.delete(oldest);
    }
    this.resolvedShotIds.add(shotId);
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

function findUnit(state: SimulationState, unitId: string): UnitModel | null {
  return state.units.find((unit) => unit.id === unitId) ?? null;
}

function unitName(unit: UnitModel | null, fallbackId: string): string {
  return unit ? `${unit.labels.ru} [${unit.id}]` : fallbackId;
}

function moralStateSnapshot(unit: UnitModel): CombatLabObservedMoralStateV1 {
  return {
    suppressionUpdateCount: unit.infantryCombatRuntime.suppression.updateCount,
    suppressionLevel: clamp01(unit.infantryCombatRuntime.suppression.suppressionLevel),
    stress: clampPercentValue(unit.behaviorRuntime.stress),
    morale: clampPercentValue(unit.soldier.condition.morale),
  };
}

function suppressionEventLabel(kind: SuppressionEventKind | null): string {
  if (kind === 'direct_hit') return 'прямое попадание';
  if (kind === 'near_impact') return 'попадание рядом';
  if (kind === 'near_miss') return 'близкий пролёт пули';
  return 'огневое воздействие';
}

function terminationReasonLabel(reason: 'impact' | 'body_penetration_limit' | 'lifetime' | 'out_of_bounds' | 'reconciled_orphan'): string {
  if (reason === 'out_of_bounds') return 'пуля покинула границы карты';
  if (reason === 'lifetime') return 'пуля исчерпала допустимое время полёта';
  if (reason === 'reconciled_orphan') return 'пуля завершена при сверке состояния';
  if (reason === 'body_penetration_limit') return 'пуля исчерпала предел пробитий';
  return 'полёт завершён столкновением';
}

function hitZoneLabel(zone: 'head' | 'torso' | 'arms' | 'legs' | null): string {
  if (zone === 'head') return 'голова';
  if (zone === 'torso') return 'корпус';
  if (zone === 'arms') return 'руки';
  if (zone === 'legs') return 'ноги';
  return 'не определена';
}

function severityLabel(severity: WoundSeverity): string {
  if (severity === 'critical') return 'критическое';
  if (severity === 'severe') return 'тяжёлое';
  return 'лёгкое';
}

function bleedingStateLabel(state: 'none' | 'severe' | 'critical' | 'stopped'): string {
  if (state === 'critical') return 'критическое';
  if (state === 'severe') return 'сильное';
  if (state === 'stopped') return 'остановлено';
  return 'отсутствует';
}

function penetrationLabel(status: 'penetrated' | 'stopped' | 'penetration_limit'): string {
  if (status === 'penetrated') return 'пуля прошла навылет';
  if (status === 'penetration_limit') return 'достигнут предел пробитий';
  return 'пуля остановилась в теле';
}

function effectiveConditionLabel(unit: UnitModel): string {
  const capabilities = getEffectiveCombatCapabilities(unit);
  const blood = unit.infantryCombatRuntime.physiology.blood.state;
  const wounds = unit.infantryCombatRuntime.wounds.slots;
  if (!capabilities.alive) return 'погиб';
  if (!capabilities.conscious) return 'без сознания';
  if (!capabilities.canUseWeapon || blood === 'critical' || wounds.some((wound) => wound.severity === 'critical')) {
    return 'тяжело ранен';
  }
  if (blood === 'weakened' || wounds.length > 0) return 'ранен, сохраняет боеспособность';
  return 'боеспособен';
}

function formatPercentTransition(before: number, after: number): string {
  const normalizedBefore = roundTenth(clampPercentValue(before));
  const normalizedAfter = roundTenth(clampPercentValue(after));
  const delta = roundTenth(normalizedAfter - normalizedBefore);
  const change = Math.abs(delta) < 0.05
    ? 'без изменения'
    : `${delta > 0 ? '+' : ''}${formatNumberRu(delta)} п.п.`;
  return `${formatNumberRu(normalizedBefore)}→${formatNumberRu(normalizedAfter)}% (${change})`;
}

function formatMetres(value: number): string {
  return formatNumberRu(Math.max(0, value));
}

function formatNumberRu(value: number): string {
  const rounded = roundTenth(Number.isFinite(value) ? value : 0);
  return (Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)).replace('.', ',');
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercentValue(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const normalized = Math.trunc(seed) >>> 0;
  return normalized === 0 ? 1 : normalized;
}
