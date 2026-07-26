import type { Ticker } from 'pixi.js';
import type { GameApplicationContext } from '../../game/GameApplicationTypes';
import type { CombatLabDiagnosticLayerId } from '../../core/testing/combat-lab';
import { CombatLabDiagnosticOverlayRenderer } from './CombatLabDiagnosticOverlayRenderer';
import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';

/**
 * Compatibility facade for the existing laboratory controls.
 *
 * The full game application owns the Pixi application, camera, map, standard
 * layers, workers and game UI. This facade owns only Combat Lab diagnostics
 * and the fixed-step visual-session listener attached to the existing ticker.
 */
export class CombatLabRenderer {
  private readonly overlay: CombatLabDiagnosticOverlayRenderer;
  private readonly removeLabTicker: () => void;
  private boundRevision: number;
  private destroyed = false;

  private constructor(
    private readonly context: GameApplicationContext,
    private readonly session: CombatLabVisualSession,
    private readonly onFrame: () => void,
  ) {
    this.overlay = new CombatLabDiagnosticOverlayRenderer(context.getWorldContainer(), session);
    this.boundRevision = session.revision;
    this.removeLabTicker = context.addTickerListener(this.tick);
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
    this.removeLabTicker();
    this.overlay.destroy();
  }

  private readonly tick = (ticker: Ticker): void => {
    if (this.destroyed) return;
    this.ensureStateBound();
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
    this.context.restartStateBoundServices();
    this.overlay.bindSession(this.session);
    this.overlay.clearHistory();
  }
}
