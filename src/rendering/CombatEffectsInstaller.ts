import type { Application, Container } from 'pixi.js';
import type { SimulationState } from '../core/simulation/SimulationState';
import type { PixiTacticalBoardApp } from './PixiApp';
import { PixiCombatEffectsRenderer } from './PixiCombatEffectsRenderer';

interface PixiBoardInternals {
  app: Application;
  worldContainer: Container;
}

export function installCombatEffectsRenderer(
  board: PixiTacticalBoardApp,
  state: SimulationState,
): () => void {
  const internals = board as unknown as PixiBoardInternals;
  const renderer = new PixiCombatEffectsRenderer();
  internals.worldContainer.addChild(renderer.container);

  const render = () => renderer.render(state);
  internals.app.ticker.add(render);
  renderer.render(state);

  return () => {
    internals.app.ticker.remove(render);
    internals.worldContainer.removeChild(renderer.container);
    renderer.destroy();
  };
}
