import type { Container, Ticker } from 'pixi.js';
import type { GameApplicationContext } from '../../game/GameApplicationTypes';
import { createPixiTacticalBoardAdapter } from '../../rendering/PixiTacticalBoardAdapter';
import type {
  CombatLabDiagnosticLayerId,
  CombatLabExperimentV1,
  CombatLabMarkerV1,
} from '../../core/testing/combat-lab';
import { CombatLabDiagnosticOverlayRenderer } from './CombatLabDiagnosticOverlayRenderer';
import { CombatLabParticipantMapPreviewRenderer } from './CombatLabParticipantMapPreviewRenderer';
import {
  CombatLabScenarioAuthoringOverlayRenderer,
  type CombatLabScenarioAuthoringOverlaySelectionV1,
} from './CombatLabScenarioAuthoringOverlayRenderer';
import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';

type CombatLabLayoutDiagnostics = {
  readonly canvasCount: number;
  readonly canvasCssWidth: number;
  readonly canvasCssHeight: number;
  readonly canvasBackingWidth: number;
  readonly canvasBackingHeight: number;
  readonly backingRatioX: number;
  readonly backingRatioY: number;
  readonly worldScaleX: number;
  readonly worldScaleY: number;
  readonly pixelsPer100MetresX: number;
  readonly pixelsPer100MetresY: number;
};

type CombatLabDebugWindow = Window & {
  __combatLabLayoutDiagnostics?: () => CombatLabLayoutDiagnostics | null;
};

/**
 * Compatibility facade for the existing laboratory controls.
 *
 * The full game application owns the Pixi application, camera, map, standard
 * layers, workers and game UI. This facade owns only the Combat Lab overlays
 * and the fixed-step visual-session listener attached to the existing ticker.
 */
export class CombatLabRenderer {
  private readonly overlay: CombatLabDiagnosticOverlayRenderer;
  private readonly authoringOverlay: CombatLabScenarioAuthoringOverlayRenderer;
  private readonly participantPreviewOverlay: CombatLabParticipantMapPreviewRenderer;
  private readonly removeLabTicker: () => void;
  private readonly removeViewportStabilizer: () => void;
  private boundRevision: number;
  private destroyed = false;

  private constructor(
    private readonly context: GameApplicationContext,
    private readonly session: CombatLabVisualSession,
    private readonly onFrame: () => void,
  ) {
    const world = context.getWorldContainer();
    this.overlay = new CombatLabDiagnosticOverlayRenderer(world, session);
    this.authoringOverlay = new CombatLabScenarioAuthoringOverlayRenderer(world);
    this.participantPreviewOverlay = new CombatLabParticipantMapPreviewRenderer(world);
    this.boundRevision = session.revision;
    this.keepProductionTickerPaused();
    this.removeLabTicker = context.addTickerListener(this.tick);
    this.removeViewportStabilizer = installStableViewportResize(context, session);
  }

  static create(
    context: GameApplicationContext,
    session: CombatLabVisualSession,
    onFrame: () => void,
  ): CombatLabRenderer {
    return new CombatLabRenderer(context, session, onFrame);
  }

  setLayerEnabled(layerId: CombatLabDiagnosticLayerId, enabled: boolean): void {
    this.ensureStateBound();
    this.overlay.setLayerEnabled(layerId, enabled);
    this.overlay.forceRender();
  }

  isLayerEnabled(layerId: CombatLabDiagnosticLayerId): boolean {
    return this.overlay.isLayerEnabled(layerId);
  }

  setAuthoredExperiment(experiment: CombatLabExperimentV1): void {
    if (this.destroyed) return;
    this.authoringOverlay.setExperiment(experiment);
    this.participantPreviewOverlay.setExperiment(experiment);
    this.context.forceRender();
  }

  setAuthoringSelection(selection: CombatLabScenarioAuthoringOverlaySelectionV1 | null): void {
    if (this.destroyed) return;
    this.authoringOverlay.setSelection(selection);
    this.context.forceRender();
  }

  setMarkerSelection(markerId: string | null): void {
    if (this.destroyed) return;
    this.authoringOverlay.setMarkerSelection(markerId);
    this.context.forceRender();
  }

  setMarkerPreview(marker: CombatLabMarkerV1 | null): void {
    if (this.destroyed) return;
    this.authoringOverlay.setMarkerPreview(marker);
    this.context.forceRender();
  }

  clearAuthoringOverlay(): void {
    if (this.destroyed) return;
    this.authoringOverlay.clear();
    this.participantPreviewOverlay.clear();
    this.context.forceRender();
  }

  clearHistory(): void {
    this.overlay.clearHistory();
  }

  forceRender(): void {
    if (this.destroyed) return;
    this.ensureStateBound();
    this.overlay.forceRender();
    this.context.forceRender();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeViewportStabilizer();
    this.removeLabTicker();
    this.participantPreviewOverlay.destroy();
    this.authoringOverlay.destroy();
    this.overlay.destroy();
  }

  private readonly tick = (ticker: Ticker): void => {
    if (this.destroyed) return;
    this.ensureStateBound();
    this.keepProductionTickerPaused();
    const changed = this.session.advance(ticker.elapsedMS / 1000);
    if (changed) {
      this.overlay.captureFrame();
      this.context.forceRender();
    }
    this.overlay.forceRender();
    this.onFrame();
  };

  private ensureStateBound(): void {
    if (this.boundRevision === this.session.revision) return;
    this.boundRevision = this.session.revision;
    this.keepProductionTickerPaused();
    this.context.restartStateBoundServices();
    this.overlay.bindSession(this.session);
    this.overlay.clearHistory();
  }

  private keepProductionTickerPaused(): void {
    (this.session.state as typeof this.session.state & { paused?: boolean }).paused = true;
  }
}

function installStableViewportResize(
  context: GameApplicationContext,
  session: CombatLabVisualSession,
): () => void {
  const canvas = document.querySelector<HTMLCanvasElement>('#app canvas');
  const root = canvas?.parentElement;
  const world = context.getWorldContainer();
  const viewportAdapter = createPixiTacticalBoardAdapter(context.board);
  if (!canvas || !root) return () => {};

  let previous = root.getBoundingClientRect();
  let frame = 0;
  let destroyed = false;

  const readDiagnostics = (): CombatLabLayoutDiagnostics | null => {
    const activeCanvas = document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!activeCanvas) return null;
    const rect = activeCanvas.getBoundingClientRect();
    const map = session.state.map;
    const worldPixelsPerMetre = map.cellSize / Math.max(0.001, map.metersPerCell);
    return {
      canvasCount: document.querySelectorAll('canvas').length,
      canvasCssWidth: rect.width,
      canvasCssHeight: rect.height,
      canvasBackingWidth: activeCanvas.width,
      canvasBackingHeight: activeCanvas.height,
      backingRatioX: activeCanvas.width / Math.max(1, rect.width),
      backingRatioY: activeCanvas.height / Math.max(1, rect.height),
      worldScaleX: world.scale.x,
      worldScaleY: world.scale.y,
      pixelsPer100MetresX: worldPixelsPerMetre * 100 * world.scale.x,
      pixelsPer100MetresY: worldPixelsPerMetre * 100 * world.scale.y,
    };
  };
  (window as CombatLabDebugWindow).__combatLabLayoutDiagnostics = readDiagnostics;

  const applyResize = (): void => {
    frame = 0;
    if (destroyed) return;
    const next = root.getBoundingClientRect();
    const deltaWidth = next.width - previous.width;
    const deltaHeight = next.height - previous.height;
    previous = next;
    if (Math.abs(deltaWidth) < 0.5 && Math.abs(deltaHeight) < 0.5) return;

    viewportAdapter.preserveViewportCentre(deltaWidth, deltaHeight);
    context.forceRender();
  };

  const schedule = (): void => {
    if (destroyed || frame !== 0) return;
    frame = window.requestAnimationFrame(applyResize);
  };

  const observer = new ResizeObserver(schedule);
  observer.observe(root);
  window.addEventListener('resize', schedule);

  return () => {
    destroyed = true;
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    if (frame !== 0) window.cancelAnimationFrame(frame);
    delete (window as CombatLabDebugWindow).__combatLabLayoutDiagnostics;
  };
}

void (null as Container | null);