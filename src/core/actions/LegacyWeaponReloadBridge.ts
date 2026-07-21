import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { isPhysicalActionRunning, type PhysicalActionCommandResult } from './PhysicalAction';
import { requestWeaponReload } from './WeaponReload';

/**
 * Compatibility boundary for old Graph v2 and bridge commands. Legacy code may
 * still publish `currentAction = reload`, but it no longer owns ammunition and
 * is converted here into the canonical serializable physical action.
 */
export function reconcileLegacyWeaponReloadRequest(
  state: SimulationState,
  unit: UnitModel,
): PhysicalActionCommandResult | null {
  if (unit.behaviorRuntime.currentAction !== 'reload' || isPhysicalActionRunning(unit)) return null;
  const result = requestWeaponReload(unit, {
    owner: { source: 'future_ai', id: `legacy-reload:${unit.id}` },
    ownerToken: `legacy-reload:${unit.id}`,
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'legacy_reload_physical_action_started',
    reasonRu: 'Старая команда перезарядки перенаправлена в физическое действие.',
  });
  if (!result.accepted || result.reasonCode === 'reload_not_required') {
    unit.behaviorRuntime.currentAction = unit.order ? 'move' : 'observe';
    unit.behaviorRuntime.reason = result.reasonRu;
    unit.behaviorRuntime.lastEvent = result.reasonCode;
  }
  return result;
}
