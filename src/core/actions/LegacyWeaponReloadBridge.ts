import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { isPhysicalActionRunning, type PhysicalActionCommandResult } from './PhysicalAction';
import {
  cancelWeaponReload,
  getRunningWeaponReload,
  requestWeaponReload,
} from './WeaponReload';

const LEGACY_OWNER_PREFIX = 'legacy-reload:';

/**
 * Compatibility boundary for old Graph v2 and bridge commands. Legacy code may
 * still publish `currentAction = reload` or `reload_cancelled`, but it no longer
 * owns ammunition and is converted here into the canonical physical action.
 */
export function reconcileLegacyWeaponReloadRequest(
  state: SimulationState,
  unit: UnitModel,
): PhysicalActionCommandResult | null {
  const ownerToken = `${LEGACY_OWNER_PREFIX}${unit.id}`;
  const running = getRunningWeaponReload(unit);

  if (unit.behaviorRuntime.currentAction === 'reload_cancelled' && running) {
    const result = cancelWeaponReload(
      unit,
      ownerToken,
      'reload_cancelled',
      'Старая Graph-команда отменила принадлежащее ей физическое действие перезарядки.',
    );
    unit.behaviorRuntime.reason = result.reasonRu;
    unit.behaviorRuntime.lastEvent = result.reasonCode;
    return result;
  }

  if (unit.behaviorRuntime.currentAction !== 'reload' || isPhysicalActionRunning(unit)) return null;
  const result = requestWeaponReload(unit, {
    owner: { source: 'future_ai', id: ownerToken },
    ownerToken,
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
