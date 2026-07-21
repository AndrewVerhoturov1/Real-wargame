import type { Application, Container } from 'pixi.js';
import type { SimulationState } from '../core/simulation/SimulationState';
import type { PixiTacticalBoardApp } from './PixiApp';
import { PixiAttentionOverlayRenderer } from './PixiAttentionOverlayRenderer';
import { PixiStaticTacticalPositionRenderer } from './PixiStaticTacticalPositionRenderer';
import { PixiTacticalPositionCandidateRenderer } from './PixiTacticalPositionCandidateRenderer';

interface PixiBoardInternals {
  app: Application;
  worldContainer: Container;
}

export function installAttentionOverlayRenderer(
  board: PixiTacticalBoardApp,
  state: SimulationState,
): () => void {
  const internals = board as unknown as PixiBoardInternals;
  const staticTacticalRenderer = new PixiStaticTacticalPositionRenderer();
  const attentionRenderer = new PixiAttentionOverlayRenderer();
  const tacticalCandidateRenderer = new PixiTacticalPositionCandidateRenderer();
  // Objective tactical raster belongs below subjective awareness and candidate markers.
  internals.worldContainer.addChild(
    staticTacticalRenderer.container,
    attentionRenderer.container,
    tacticalCandidateRenderer.container,
  );

  const render = () => {
    staticTacticalRenderer.render(state);
    attentionRenderer.render(state);
    tacticalCandidateRenderer.render(state);
  };
  internals.app.ticker.add(render);
  render();

  return () => {
    internals.app.ticker.remove(render);
    internals.worldContainer.removeChild(
      staticTacticalRenderer.container,
      attentionRenderer.container,
      tacticalCandidateRenderer.container,
    );
    staticTacticalRenderer.destroy();
    attentionRenderer.destroy();
    tacticalCandidateRenderer.destroy();
  };
}
