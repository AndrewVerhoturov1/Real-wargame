import { isUnitCombatCapable } from '../combat/CombatDamage';
import type { MovementProfileRegistryEntry } from '../movement/MovementProfiles';
import {
  measurePerformancePhase,
  withPerformancePhaseContext,
} from '../debug/PerformancePhases';
import type { SimulationState } from '../simulation/SimulationState';
import { isUnitGraphAiControlled, type UnitModel } from '../units/UnitModel';
import {
  recordAiSchedulerCycle,
  recordAiSchedulerCycleDuration,
  recordAiSchedulerUnitPass,
  recordAiSchedulerUnitPassDuration,
} from './AiSchedulerPerformanceDiagnostics';
import { resolveRuntimeGraphSnapshot } from './AiGameBridge';
import { tickStatefulMoveBridgeForTrustedUnit } from './AiStatefulMoveGameBridge';

const MAX_ORDINARY_DECISIONS_PER_CYCLE = 3;

export interface AiSimulationSchedulerOptions {
  readonly cycleStartMs?: number;
  readonly cycleEndMs?: number;
  readonly movementProfileRegistryEntries?: readonly MovementProfileRegistryEntry[];
}

export interface AiSimulationSchedulerResult {
  readonly simulationStep: number;
  readonly simulationTimeMs: number;
  readonly cycleStartMs: number;
  readonly cycleEndMs: number;
  readonly eligibleUnitIds: readonly string[];
  readonly processedUnitIds: readonly string[];
  readonly graphTickedUnitIds: readonly string[];
  readonly ordinaryDecisionUnitIds: readonly string[];
  readonly ordinaryDeferredUnitIds: readonly string[];
  readonly duplicateSkippedUnitIds: readonly string[];
  readonly unitVisits: number;
  readonly trustedBridgeCalls: number;
  readonly membershipScans: 0;
  readonly graphResolutionCount: 1;
  readonly graphSourceRevision: string;
  readonly graphSnapshotFrozen: boolean;
  readonly schedulerDurationMs: number;
  readonly graphResolutionDurationMs: number;
  readonly unitPassDurationMs: number;
  readonly schedulerOverheadMs: number;
  readonly maxUnitId: string | null;
  readonly maxUnitDurationMs: number;
  readonly maxUnitActiveNode: string | null;
}

/**
 * Canonical gameplay entry point for node-graph AI.
 *
 * One stable O(n) traversal owns the cycle. The graph snapshot is resolved once
 * and shared immutably by every eligible unit. Trusted bridge functions do not
 * rescan state.units for membership.
 */
export function tickAiSimulationScheduler(
  state: SimulationState,
  options: AiSimulationSchedulerOptions = {},
): AiSimulationSchedulerResult {
  const schedulerStartedAt = performance.now();
  const simulationTimeMs = Math.max(0, Math.round(state.simulationTimeSeconds * 1000));
  const cycleEndMs = Math.max(0, options.cycleEndMs ?? simulationTimeMs);
  const cycleStartMs = Math.max(0, Math.min(cycleEndMs, options.cycleStartMs ?? cycleEndMs));
  const graphResolutionStartedAt = performance.now();
  const graphSnapshot = measurePerformancePhase(
    'simulation.ai-scheduler.graph-resolution',
    resolveRuntimeGraphSnapshot,
  );
  const graphResolutionMs = performance.now() - graphResolutionStartedAt;
  const eligibleUnits: UnitModel[] = [];
  const eligibleUnitIds: string[] = [];
  const processedUnitIds: string[] = [];
  const graphTickedUnitIds: string[] = [];
  const duplicateSkippedUnitIds: string[] = [];
  let unitVisits = 0;

  for (const unit of state.units) {
    unitVisits += 1;
    if (!isSimulationAiControlledUnit(unit)) continue;
    eligibleUnits.push(unit);
    eligibleUnitIds.push(unit.id);
  }
  const ordinaryDecisionUnitIds = selectOrdinaryDecisionUnits(
    eligibleUnits,
    cycleEndMs,
    state.simulationStep,
  );
  const ordinaryDecisionUnitIdSet = new Set(ordinaryDecisionUnitIds);
  const ordinaryDeferredUnitIds: string[] = [];
  let trustedBridgeCalls = 0;
  let unitPassDurationMs = 0;
  let maxUnitId: string | null = null;
  let maxUnitDurationMs = 0;
  let maxUnitActiveNode: string | null = null;

  for (const unit of eligibleUnits) {
    if (unit.behaviorRuntime.aiLastSimulationStep === state.simulationStep) {
      duplicateSkippedUnitIds.push(unit.id);
      continue;
    }

    unit.behaviorRuntime.aiLastSimulationStep = state.simulationStep;
    processedUnitIds.push(unit.id);
    trustedBridgeCalls += 1;

    const ordinaryDecisionDue = isOrdinaryDecisionDue(unit, cycleEndMs);
    const deferOrdinaryDecision = ordinaryDecisionDue && !ordinaryDecisionUnitIdSet.has(unit.id);
    if (deferOrdinaryDecision) ordinaryDeferredUnitIds.push(unit.id);

    const decisionTickBefore = unit.behaviorRuntime.aiDecisionTickCount;
    const observerPollBefore = unit.behaviorRuntime.aiObserverPollCount;
    const reactiveWakeBefore = unit.behaviorRuntime.aiReactiveWakeCount;
    const activeBefore = unit.behaviorRuntime.aiRuntimeSession?.executionState;
    const unitStartedAt = performance.now();
    const result = withPerformancePhaseContext(
      {
        unitId: unit.id,
        simulationStep: state.simulationStep,
        activeNodeId: activeBefore?.activeNodeId ?? null,
        activeSubgraphId: readActiveSubgraphId(activeBefore?.activeData),
      },
      () => measurePerformancePhase(
        'simulation.ai-scheduler.unit-bridge',
        () => tickStatefulMoveBridgeForTrustedUnit(state, unit, cycleEndMs, {
          force: false,
          applyEffects: true,
          graphSnapshot,
          cycleStartMs,
          cycleEndMs,
          deferOrdinaryDecision,
          movementProfileRegistryEntries: options.movementProfileRegistryEntries,
        }),
      ),
    );
    const unitDurationMs = performance.now() - unitStartedAt;
    const activeAfter = unit.behaviorRuntime.aiRuntimeSession?.executionState;
    unitPassDurationMs += unitDurationMs;
    if (unitDurationMs > maxUnitDurationMs) {
      maxUnitDurationMs = unitDurationMs;
      maxUnitId = unit.id;
      maxUnitActiveNode = result?.activeNodeId ?? activeAfter?.activeNodeId ?? activeBefore?.activeNodeId ?? null;
    }
    const graphTicked = result !== null;
    if (graphTicked) graphTickedUnitIds.push(unit.id);

    const decisionTickDelta = unit.behaviorRuntime.aiDecisionTickCount - decisionTickBefore;
    const observerPollDelta = unit.behaviorRuntime.aiObserverPollCount - observerPollBefore;
    const reactiveWakeDelta = unit.behaviorRuntime.aiReactiveWakeCount - reactiveWakeBefore;
    recordAiSchedulerUnitPassDuration(unitDurationMs, graphTicked);
    if (graphTicked || unitDurationMs >= 8) {
      recordAiSchedulerUnitPass({
        simulationStep: state.simulationStep,
        cycleStartMs,
        cycleEndMs,
        unitId: unit.id,
        durationMs: roundTwo(unitDurationMs),
        decisionTickDelta,
        observerPollDelta,
        reactiveWakeDelta,
        graphTicked,
        resultStatus: result?.status ?? null,
        activeNodeBefore: activeBefore?.activeNodeId ?? null,
        activeNodeAfter: result?.activeNodeId ?? activeAfter?.activeNodeId ?? null,
        activeSubgraphAfter: result?.activeSubgraphId ?? readActiveSubgraphId(activeAfter?.activeData),
        effectTypes: result ? describeEffects(result.effects) : [],
        currentAction: unit.behaviorRuntime.currentAction,
        lastEvent: unit.behaviorRuntime.lastEvent ?? null,
      });
    }
  }

  const schedulerDurationMs = performance.now() - schedulerStartedAt;
  const schedulerOverheadMs = Math.max(0, schedulerDurationMs - graphResolutionMs - unitPassDurationMs);
  const decisionCycle = graphTickedUnitIds.length > 0;
  recordAiSchedulerCycleDuration(schedulerDurationMs, decisionCycle);
  if (decisionCycle || schedulerDurationMs >= 8) {
    recordAiSchedulerCycle({
      simulationStep: state.simulationStep,
      cycleStartMs,
      cycleEndMs,
      durationMs: roundTwo(schedulerDurationMs),
      graphResolutionMs: roundTwo(graphResolutionMs),
      unitPassDurationMs: roundTwo(unitPassDurationMs),
      overheadMs: roundTwo(schedulerOverheadMs),
      eligibleUnitCount: eligibleUnitIds.length,
      processedUnitCount: processedUnitIds.length,
      graphTickedUnitCount: graphTickedUnitIds.length,
      maxUnitId,
      maxUnitDurationMs: roundTwo(maxUnitDurationMs),
    });
  }

  return {
    simulationStep: state.simulationStep,
    simulationTimeMs,
    cycleStartMs,
    cycleEndMs,
    eligibleUnitIds,
    processedUnitIds,
    graphTickedUnitIds,
    ordinaryDecisionUnitIds,
    ordinaryDeferredUnitIds,
    duplicateSkippedUnitIds,
    unitVisits,
    trustedBridgeCalls,
    membershipScans: 0,
    graphResolutionCount: 1,
    graphSourceRevision: graphSnapshot.sourceRevision,
    graphSnapshotFrozen: Object.isFrozen(graphSnapshot) && Object.isFrozen(graphSnapshot.graph),
    schedulerDurationMs: roundTwo(schedulerDurationMs),
    graphResolutionDurationMs: roundTwo(graphResolutionMs),
    unitPassDurationMs: roundTwo(unitPassDurationMs),
    schedulerOverheadMs: roundTwo(schedulerOverheadMs),
    maxUnitId,
    maxUnitDurationMs: roundTwo(maxUnitDurationMs),
    maxUnitActiveNode,
  };
}


function selectOrdinaryDecisionUnits(
  eligibleUnits: readonly UnitModel[],
  cycleEndMs: number,
  simulationStep: number,
): string[] {
  if (eligibleUnits.length === 0) return [];
  const selected: string[] = [];
  const startIndex = simulationStep % eligibleUnits.length;
  for (let offset = 0; offset < eligibleUnits.length && selected.length < MAX_ORDINARY_DECISIONS_PER_CYCLE; offset += 1) {
    const unit = eligibleUnits[(startIndex + offset) % eligibleUnits.length];
    if (isOrdinaryDecisionDue(unit, cycleEndMs)) selected.push(unit.id);
  }
  return selected;
}

function isOrdinaryDecisionDue(unit: UnitModel, cycleEndMs: number): boolean {
  return unit.behaviorRuntime.aiDecisionTickCount === 0
    || Math.max(0, unit.behaviorRuntime.aiNextDecisionAtMs) <= cycleEndMs;
}

export function isSimulationAiControlledUnit(unit: UnitModel): boolean {
  return isUnitGraphAiControlled(unit) && isUnitCombatCapable(unit);
}

function readActiveSubgraphId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { kind?: unknown; subgraphId?: unknown };
  return candidate.kind === 'subgraph' && typeof candidate.subgraphId === 'string'
    ? candidate.subgraphId
    : null;
}

function describeEffects(effects: ReadonlyArray<{ readonly type: string; readonly action?: string }>): string[] {
  return effects.map((effect) => effect.type === 'set_action' && effect.action
    ? `${effect.type}:${effect.action}`
    : effect.type);
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
