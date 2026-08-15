import { reconcilePlayerPostureMovementAuthority } from '../actions/PlayerPostureMovementSync';
import { reconcileMovementPostureRequest } from '../actions/PostureTransition';
import {
  beginWeaponDeploymentStepLocks,
  endWeaponDeploymentStepLocks,
} from '../infantry-combat/runtime/WeaponDeploymentLocks';
import { recordSimulationKnowledgeHistory } from '../knowledge/UnitKnowledgeHistory';
import { reconcileCompletedTacticalPositionArrivals } from '../tactical/TacticalPositionArrival';
import { reconcileTacticalPositionOccupation } from '../tactical/TacticalPositionOccupation';
import { requestStaticTacticalPositionBasis } from '../tactical/static/StaticTacticalPositionService';
import type { SimulationState } from './SimulationState';
import { tickSimulation as tickSimulationLegacy } from './SimulationTickLegacy';

export * from './SimulationTickLegacy';

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  requestStaticTacticalPositionBasis(state);
  // Capture the exact pre-step subjective state, including t=0 scenario knowledge.
  recordSimulationKnowledgeHistory(state);

  for (const unit of state.units) {
    reconcilePlayerPostureMovementAuthority(unit);
    reconcileTacticalPositionOccupation(state, unit);
    reconcileMovementPostureRequest(state, unit);
  }

  const deploymentStepLocks = beginWeaponDeploymentStepLocks(state.units);
  try {
    tickSimulationLegacy(state, deltaSeconds);
    // Perception and threat memory are now current for this simulation time.
    recordSimulationKnowledgeHistory(state);
    reconcileCompletedTacticalPositionArrivals(state);
    for (const unit of state.units) reconcileTacticalPositionOccupation(state, unit);
  } finally {
    endWeaponDeploymentStepLocks(deploymentStepLocks);
  }
}

/**
 * The wrapper starts posture requests that already exist at the beginning of a
 * step. The legacy pipeline advances the action after Graph v2 has emitted any
 * commands that occur inside that same simulation interval.
 */
