import { requestPlayerPostureTransition } from '../core/actions/PostureTransition';
import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSelectedUnit } from '../core/simulation/SimulationState';
import {
  installTacticalWorkspace as installLegacyTacticalWorkspace,
  type TacticalWorkspaceMode,
} from './TacticalWorkspaceBaseLegacy';

export type { TacticalWorkspaceMode } from './TacticalWorkspaceBaseLegacy';

/** Installs the established workspace and replaces only its legacy instant-posture controls. */
export function installTacticalWorkspace(
  state: SimulationState,
  aiBridge: AiGameBridgeHandle,
  onChanged: () => void,
): () => void {
  const cleanup = installLegacyTacticalWorkspace(state, aiBridge, onChanged);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-posture]')) {
    button.onclick = () => {
      const unit = getSelectedUnit(state);
      if (!unit) return;
      const posture = button.dataset.posture as UnitPosture;
      const label = button.textContent ?? 'поза';
      const result = requestPlayerPostureTransition(unit, posture, state.simulationTimeSeconds);
      unit.behaviorRuntime.reason = result.accepted
        ? `Принят приказ изменить позу: ${label}.`
        : result.reasonRu;
      onChanged();
    };
  }
  return cleanup;
}

// Keep the type visibly used for declaration emit and compatibility tooling.
void (null as TacticalWorkspaceMode | null);
