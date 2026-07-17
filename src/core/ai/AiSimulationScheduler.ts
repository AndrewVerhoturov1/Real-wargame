import { isUnitCombatCapable } from '../combat/CombatDamage';
import {
  measurePerformancePhase,
  withPerformancePhaseContext,
} from '../debug/PerformancePhases';
import type { SimulationState } from '../simulation/SimulationState';
import { isUnitGraphAiControlled, type UnitModel } from '../units/UnitModel';
import {
  recordAiSchedulerCycle,
  recordAiSchedulerUnitPass,
} from './AiSchedulerPerformanceDiagnostics';
import { resolveRuntimeGraphSnapshot } from './AiGameBridge';
import { tickStatefulMoveBridgeForTrustedUnit } from './AiStatefulMoveGameBridge';

export interface AiSimulationSchedulerOptions {
  readonly cycleStartMs?: number;
  readonly cycleEndMs?: number;
}

export interface AiSimulationSchedulerResult {
  readonly simulationStep: number;
  readonly simulationTimeMs: number;
  readonly cycleStartMs: number;
  readonly cycleEndMs: number;
  readonly eligibleUnitIds: readonly string[];
  readonly processedUnitIds: readonly string[];
  readonly graphTickedUnitIds: readonly string[];
  readonly duplicateSkippedUnitIds: readonly string[];
  readonly unitVisits: number;
  readonly trustedBridgeCalls: number;
  readonly membershipScans: 0;
  readonly graphResolutionCount: 1;
  readonly graphSourceRevision: string;
  readonly graphSnapshotFrozen: boolean;
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
  const eligibleUnitIds: string[] = [];
  const processedUnitIds: string[] = [];
  const graphTickedUnitIds: string[] = [];
  const duplicateSkippedUnitIds: string[] = [];
  let unitVisits = 0;
  let trustedBridgeCalls = 0;
  let unitPassDurationMs = 0;
  let maxUnitId: string | null = null;
  let maxUnitDurationMs = 0;

  for (const unit of state.units) {
    unitVisits += 1;
    if (!isSimulationAiControlledUnit(unit)) continue;
    eligibleUnitIds.push(unit.id);

    if (unit.behaviorRuntime.aiLastSimulationStep === state.simulationStep) {
      duplicateSkippedUnitIds.push(unit.id);
      continue;
    }

    unit.behaviorRuntime.aiLastSimulationStep = state.simulationStep;
    processedUnitIds.push(unit.id);
    trustedBridgeCalls += 1;

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
        }),
      ),
    );
    const unitDurationMs = performance.now() - unitStartedAt;
    unitPassDurationMs += unitDurationMs;
    if (unitDurationMs > maxUnitDurationMs) {
      maxUnitDurationMs = unitDurationMs;
      maxUnitId = unit.id;
    }
    if (result) graphTickedUnitIds.push(unit.id);

    const activeAfter = unit.behaviorRuntime.aiRuntimeSession?.executionState;
    recordAiSchedulerUnitPass({
      simulationStep: state.simulationStep,
      cycleStartMs,
      cycleEndMs,
      unitId: unit.id,
      durationMs: roundTwo(unitDurationMs),
      decisionTickDelta: unit.behaviorRuntime.aiDecisionTickCount - decisionTickBefore,
      observerPollDelta: unit.behaviorRuntime.aiObserverPollCount - observerPollBefore,
      reactiveWakeDelta: unit.behaviorRuntime.aiReactiveWakeCount - reactiveWakeBefore,
      graphTicked: result !== null,
      resultStatus: result?.status ?? null,
      activeNodeBefore: activeBefore?.activeNodeId ?? null,
      activeNodeAfter: result?.activeNodeId ?? activeAfter?.activeNodeId ?? null,
      activeSubgraphAfter: result?.activeSubgraphId ?? readActiveSubgraphId(activeAfter?.activeData),
      effectTypes: result ? describeEffects(result.effects) : [],
      currentAction: unit.behaviorRuntime.currentAction,
      lastEvent: unit.behaviorRuntime.lastEvent ?? null,
    });
  }

  const schedulerDurationMs = performance.now() - schedulerStartedAt;
  recordAiSchedulerCycle({
    simulationStep: state.simulationStep,
    cycleStartMs,
    cycleEndMs,
    durationMs: roundTwo(schedulerDurationMs),
    graphResolutionMs: roundTwo(graphResolutionMs),
    unitPassDurationMs: roundTwo(unitPassDurationMs),
    overheadMs: roundTwo(Math.max(0, schedulerDurationMs - graphResolutionMs - unitPassDurationMs)),
    eligibleUnitCount: eligibleUnitIds.length,
    processedUnitCount: processedUnitIds.length,
    graphTickedUnitCount: graphTickedUnitIds.length,
    maxUnitId,
    maxUnitDurationMs: roundTwo(maxUnitDurationMs),
  });

  return {
    simulationStep: state.simulationStep,
    simulationTimeMs,
    cycleStartMs,
    cycleEndMs,
    eligibleUnitIds,
    processedUnitIds,
    graphTickedUnitIds,
    duplicateSkippedUnitIds,
    unitVisits,
    trustedBridgeCalls,
    membershipScans: 0,
    graphResolutionCount: 1,
    graphSourceRevision: graphSnapshot.sourceRevision,
    graphSnapshotFrozen: Object.isFrozen(graphSnapshot) && Object.isFrozen(graphSnapshot.graph),
  };
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
