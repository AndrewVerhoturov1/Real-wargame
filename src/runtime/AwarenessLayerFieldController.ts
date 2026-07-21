import '../core/tactical/TacticalPositionSearchResilience';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { getSimulationLayerState, type SimulationLayerMode } from '../core/ui/RuntimeUiState';
import type { UnitModel } from '../core/units/UnitModel';
import {
  buildAwarenessMapKey,
  type PreparedAwarenessWorldSnapshot,
} from './AwarenessWorldRuntime';

const LIVE_FIELD_REFRESH_INTERVAL_MS = 100;
const LAYER_CHANGED_EVENT = 'real-wargame:tactical-position-tab-changed';
const LIVE_AWARENESS_MODES = new Set<SimulationLayerMode>(['danger', 'stealth', 'positions']);

export interface AwarenessWorldFieldRequester {
  requestWorldField(unit: UnitModel): PreparedAwarenessWorldSnapshot | null;
}

export type AwarenessWorldFieldRequesterResolver = (
  state: SimulationState,
) => AwarenessWorldFieldRequester | null;

/**
 * Application-owned request coordinator for the shared awareness world field.
 *
 * The Pixi renderer remains presentation-only. This controller requests exactly
 * one worker field for each relevant subjective/map identity while a live
 * danger-backed layer is visible. Tactical-position extraction is not invoked.
 */
export class AwarenessLayerFieldController {
  private lastRequestedIdentity = '';
  private destroyed = false;

  constructor(
    private readonly state: SimulationState,
    private readonly resolveRequester: AwarenessWorldFieldRequesterResolver,
  ) {}

  update(): void {
    if (this.destroyed) return;
    const layer = getSimulationLayerState(this.state);
    const unit = getSelectedUnit(this.state);
    if (this.state.editor.enabled || !LIVE_AWARENESS_MODES.has(layer.mode) || !unit) {
      this.lastRequestedIdentity = '';
      return;
    }

    const requester = this.resolveRequester(this.state);
    if (!requester) {
      this.lastRequestedIdentity = '';
      return;
    }

    const identity = buildLiveFieldRequestIdentity(this.state, unit);
    if (identity === this.lastRequestedIdentity) return;
    this.lastRequestedIdentity = identity;
    requester.requestWorldField(unit);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lastRequestedIdentity = '';
  }
}

export function installAwarenessLayerFieldController(
  state: SimulationState,
  requester: AwarenessWorldFieldRequester,
): () => void {
  const controller = new AwarenessLayerFieldController(state, () => requester);
  const update = (): void => controller.update();
  let disposed = false;

  update();
  window.addEventListener(LAYER_CHANGED_EVENT, update);
  const interval = window.setInterval(update, LIVE_FIELD_REFRESH_INTERVAL_MS);

  return () => {
    if (disposed) return;
    disposed = true;
    window.clearInterval(interval);
    window.removeEventListener(LAYER_CHANGED_EVENT, update);
    controller.destroy();
  };
}

function buildLiveFieldRequestIdentity(state: SimulationState, unit: UnitModel): string {
  return [
    buildAwarenessMapKey(state.map),
    `unit:${unit.id}`,
    `posture:${unit.behaviorRuntime.posture}`,
    `knowledge:${unit.tacticalKnowledge.revision}`,
  ].join(';');
}
