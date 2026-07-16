import { isUnitCombatCapable } from '../combat/CombatDamage';
import type { SimulationState } from '../simulation/SimulationState';
import { isUnitGraphAiControlled, type UnitModel } from '../units/UnitModel';
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
  const simulationTimeMs = Math.max(0, Math.round(state.simulationTimeSeconds * 1000));
  const cycleEndMs = Math.max(0, options.cycleEndMs ?? simulationTimeMs);
  const cycleStartMs = Math.max(0, Math.min(cycleEndMs, options.cycleStartMs ?? cycleEndMs));
  const graphSnapshot = resolveRuntimeGraphSnapshot();
  const eligibleUnitIds: string[] = [];
  const processedUnitIds: string[] = [];
  const graphTickedUnitIds: string[] = [];
  const duplicateSkippedUnitIds: string[] = [];
  let unitVisits = 0;
  let trustedBridgeCalls = 0;

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

    const result = tickStatefulMoveBridgeForTrustedUnit(state, unit, cycleEndMs, {
      force: false,
      applyEffects: true,
      graphSnapshot,
      cycleStartMs,
      cycleEndMs,
    });
    if (result) graphTickedUnitIds.push(unit.id);
  }

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

