import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  advanceBloodRuntimeTo,
  refreshUnitBleedingRateAt,
} from './BloodLossRuntime';
import {
  applyFatigueBoundary,
  calculateFatigueFactorSample,
  calculateWoundBurden,
  FATIGUE_REFERENCE_RUN_SPEED_METRES_PER_SECOND,
  FATIGUE_UPDATE_INTERVAL_SECONDS,
  sampleFatigueRateForNextInterval,
} from './FatigueRuntime';
import { tickFirstAidActionsAtBoundary } from './FirstAidRuntime';
import { tickInfantryCombatSimulation } from './InfantryCombatSimulation';
import { enforceEffectiveCombatCapabilities } from './WoundImpactApplication';

const TIME_EPSILON_SECONDS = 1e-9;
const MAX_COMBINED_BOUNDARIES_PER_TICK = 4096;

export interface TickInfantryPhysiologySimulationInput {
  readonly intervalStartSeconds: number;
  readonly deltaSeconds: number;
}

/**
 * Stage 7 owner of the shared combat/medical timeline. Projectile simulation is
 * delegated exactly once per segment and is never advanced from a physiology loop.
 */
export function tickInfantryPhysiologySimulation(
  state: SimulationState,
  input: TickInfantryPhysiologySimulationInput,
): void {
  const startSeconds = finiteNonNegative(input.intervalStartSeconds);
  const deltaSeconds = finiteNonNegative(input.deltaSeconds);
  const endSeconds = canonicalSeconds(startSeconds + deltaSeconds);
  if (deltaSeconds <= TIME_EPSILON_SECONDS) {
    initializeFatigueSamples(state);
    return;
  }

  initializeFatigueSamples(state);
  let cursorSeconds = startSeconds;
  let guard = 0;
  while (cursorSeconds + TIME_EPSILON_SECONDS < endSeconds) {
    const nextBoundarySeconds = nextGlobalQuarterSecondAfter(cursorSeconds);
    const segmentEndSeconds = Math.min(endSeconds, nextBoundarySeconds);
    const segmentSeconds = canonicalSeconds(segmentEndSeconds - cursorSeconds);
    if (segmentSeconds > TIME_EPSILON_SECONDS) {
      tickInfantryCombatSimulation(state, {
        intervalStartSeconds: cursorSeconds,
        deltaSeconds: segmentSeconds,
      });
      advanceAllBloodTo(state, segmentEndSeconds);
    }
    cursorSeconds = segmentEndSeconds;
    if (Math.abs(cursorSeconds - nextBoundarySeconds) <= TIME_EPSILON_SECONDS) {
      processSharedQuarterBoundary(state, cursorSeconds);
    }
    guard += 1;
    if (guard > MAX_COMBINED_BOUNDARIES_PER_TICK) {
      throw new Error('Infantry physiology combined-boundary guard exceeded.');
    }
  }
}

function processSharedQuarterBoundary(state: SimulationState, boundarySeconds: number): void {
  const units = stableUnits(state);
  for (const unit of units) {
    const blood = unit.infantryCombatRuntime.physiology.blood;
    const previousState = blood.state;
    advanceBloodRuntimeTo(blood, boundarySeconds);
    if (blood.state !== previousState) enforceEffectiveCombatCapabilities(unit, boundarySeconds);
  }

  for (const unit of units) {
    const fatigue = unit.infantryCombatRuntime.physiology.fatigue;
    if (fatigue.nextUpdateBoundarySeconds + TIME_EPSILON_SECONDS < boundarySeconds) {
      rebaseMissedFatigueBoundary(fatigue, boundarySeconds);
    }
    applyFatigueBoundary(fatigue, boundarySeconds);
  }

  tickFirstAidActionsAtBoundary(state, boundarySeconds);

  for (const unit of units) {
    refreshUnitBleedingRateAt(unit, boundarySeconds);
    enforceEffectiveCombatCapabilities(unit, boundarySeconds);
  }
  sampleAllFatigueRates(state, units);
}

function initializeFatigueSamples(state: SimulationState): void {
  const units = stableUnits(state);
  let needsInitialization = false;
  for (const unit of units) {
    if (!unit.infantryCombatRuntime.physiology.fatigue.initialized) {
      needsInitialization = true;
      break;
    }
  }
  if (needsInitialization) sampleAllFatigueRates(state, units);
}

function sampleAllFatigueRates(state: SimulationState, units: readonly UnitModel[]): void {
  for (const unit of units) {
    const task = unit.infantryCombatRuntime.activeFireTask;
    const weaponClass = unit.infantryCombatRuntime.primaryWeapon?.resolved.weapon.weaponClass ?? null;
    sampleFatigueRateForNextInterval(
      unit.infantryCombatRuntime.physiology.fatigue,
      calculateFatigueFactorSample({
        actualMovementSpeedMetresPerSecond: Math.hypot(
          unit.movementRuntime.velocityCellsPerSecond.x,
          unit.movementRuntime.velocityCellsPerSecond.y,
        ) * state.map.metersPerCell,
        referenceRunSpeedMetresPerSecond: FATIGUE_REFERENCE_RUN_SPEED_METRES_PER_SECOND,
        posture: unit.behaviorRuntime.posture,
        isAiming: task?.phase === 'aiming',
        isApplyingFirstAid: unit.infantryCombatRuntime.medical.activeFirstAidAction !== null,
        isHeavyWeaponActive: weaponClass === 'machine_gun' && task !== null,
        isDeployActionActive: false,
        woundBurden: calculateWoundBurden(unit.infantryCombatRuntime.wounds.slots),
        bloodState: unit.infantryCombatRuntime.physiology.blood.state,
      }),
    );
  }
}

function advanceAllBloodTo(state: SimulationState, seconds: number): void {
  for (const unit of stableUnits(state)) {
    const blood = unit.infantryCombatRuntime.physiology.blood;
    const previousState = blood.state;
    advanceBloodRuntimeTo(blood, seconds);
    if (blood.state !== previousState) enforceEffectiveCombatCapabilities(unit, seconds);
  }
}

function rebaseMissedFatigueBoundary(
  runtime: UnitModel['infantryCombatRuntime']['physiology']['fatigue'],
  boundarySeconds: number,
): void {
  runtime.lastUpdateBoundarySeconds = canonicalSeconds(boundarySeconds - FATIGUE_UPDATE_INTERVAL_SECONDS);
  runtime.nextUpdateBoundarySeconds = canonicalSeconds(boundarySeconds);
}

function stableUnits(state: SimulationState): UnitModel[] {
  return [...state.units].sort((left, right) => compareText(left.id, right.id));
}
function nextGlobalQuarterSecondAfter(seconds: number): number {
  const step = Math.floor(Math.max(0, seconds) / FATIGUE_UPDATE_INTERVAL_SECONDS + TIME_EPSILON_SECONDS) + 1;
  return canonicalSeconds(step * FATIGUE_UPDATE_INTERVAL_SECONDS);
}
function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
function canonicalSeconds(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000;
}
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
