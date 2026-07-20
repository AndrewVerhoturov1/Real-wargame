import type { Container } from 'pixi.js';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';
import {
  PixiOverlayRenderer as PixiOverlayRendererBase,
} from './PixiOverlayRendererBase';

export * from './PixiOverlayRendererBase';

interface OverlayRendererInternals {
  threatGeometryContainer: Container;
  renderZoneLayerIfNeeded(state: SimulationState, showPressureZones: boolean): void;
  renderRealReliefLayerIfNeeded(state: SimulationState): void;
  renderThreatLayersIfNeeded(state: SimulationState): void;
  renderProbeLayerIfNeeded(state: SimulationState): void;
  renderInteractionLayerIfNeeded(state: SimulationState, showGrid: boolean): void;
}

/**
 * Overlay renderer without the removed object/forest cover-marker layer.
 * Tactical positions are rendered by PixiAwarenessHeatmapRenderer from the
 * shared soldier field, so this renderer must not perform a second lookup.
 */
export class PixiOverlayRenderer extends PixiOverlayRendererBase {
  override render(state: SimulationState, showGrid = true, showPressureZones = true): void {
    const renderer = this as unknown as OverlayRendererInternals;
    renderer.renderZoneLayerIfNeeded(state, showPressureZones && state.editor.enabled);
    renderer.renderRealReliefLayerIfNeeded(state);
    renderer.renderThreatLayersIfNeeded(state);
    const layer = getSimulationLayerState(state);
    renderer.threatGeometryContainer.visible = layer.mode !== 'danger' || layer.showThreatCones;
    renderer.renderProbeLayerIfNeeded(state);
    renderer.renderInteractionLayerIfNeeded(state, showGrid);
  }
}

/** @deprecated Legacy cover-marker rendering was removed. */
export function drawCoverKnowledgeOverlay(_container: Container, _state: SimulationState): void {
  // Intentionally empty. Tactical positions are field-driven diamonds.
}
