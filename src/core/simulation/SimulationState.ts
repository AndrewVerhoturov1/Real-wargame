import { cancelReplaceablePostureTransitionForNewPlayerCommand } from '../actions/PostureTransition';
import type { GridPosition } from '../geometry';
import type { UnitModel } from '../units/UnitModel';
import * as legacy from './SimulationStateLegacy';

export * from './SimulationStateLegacy';

/**
 * Compatibility facade for the old selection-box command path. It delegates
 * editor pressure/facing bookkeeping to the established implementation, while
 * preventing that legacy path from changing the canonical posture instantly.
 */
export function issueMoveOrderToSelectedUnit(
  state: legacy.SimulationState,
  rawTarget: GridPosition,
): void {
  const selected = legacy.getSelectedUnits(state);
  const postureSnapshots = new Map<string, Pick<UnitModel['behaviorRuntime'],
    'posture' | 'previousPosture' | 'postureChangedBecause'>>();

  for (const unit of selected) {
    cancelReplaceablePostureTransitionForNewPlayerCommand(unit);
    postureSnapshots.set(unit.id, {
      posture: unit.behaviorRuntime.posture,
      previousPosture: unit.behaviorRuntime.previousPosture,
      postureChangedBecause: unit.behaviorRuntime.postureChangedBecause,
    });
  }

  legacy.issueMoveOrderToSelectedUnit(state, rawTarget);

  for (const unit of selected) {
    const snapshot = postureSnapshots.get(unit.id);
    if (snapshot) {
      unit.behaviorRuntime.posture = snapshot.posture;
      unit.behaviorRuntime.previousPosture = snapshot.previousPosture;
      unit.behaviorRuntime.postureChangedBecause = snapshot.postureChangedBecause;
    }
    if (unit.order) {
      unit.order.source = 'player';
      unit.order.ownerToken = `legacy-player-route:${unit.id}`;
    }
  }
}
