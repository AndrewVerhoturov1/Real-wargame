import type { Application, Container, Ticker } from 'pixi.js';
import type { SimulationState } from '../core/simulation/SimulationState';
import type { PixiTacticalBoardApp } from './PixiApp';

interface MutableBoardInputInternals {
  state: SimulationState;
}

interface MutableCameraInternals {
  preserveViewportCentre(deltaWidth: number, deltaHeight: number): void;
}

interface PixiTacticalBoardInternals {
  app: Application;
  worldContainer: Container;
  state: SimulationState;
  boardInput: MutableBoardInputInternals;
  camera: MutableCameraInternals;
  fixedScaleLabel: HTMLElement;
  mapRenderInvalidated: boolean;
  lastMapRenderKey: string;
  viewConeRenderer: { clear(): void };
}

export interface PixiTacticalBoardAdapter {
  getWorldContainer(): Container;
  addTickerListener(listener: (ticker: Ticker) => void): () => void;
  bindSimulationState(state: SimulationState): void;
  preserveViewportCentre(deltaWidth: number, deltaHeight: number): void;
}

/**
 * Narrow adapter following the same internal-board pattern as the existing
 * combat and attention overlay installers. It keeps private-field knowledge in
 * one checked module instead of spreading casts across feature code.
 */
export function createPixiTacticalBoardAdapter(board: PixiTacticalBoardApp): PixiTacticalBoardAdapter {
  const internals = board as unknown as PixiTacticalBoardInternals;

  return {
    getWorldContainer: () => internals.worldContainer,
    addTickerListener: (listener) => {
      internals.app.ticker.add(listener);
      return () => internals.app.ticker.remove(listener);
    },
    bindSimulationState: (state) => {
      internals.state = state;
      internals.boardInput.state = state;
      internals.fixedScaleLabel.textContent = `1 клетка = ${state.map.metersPerCell} м`;
      internals.lastMapRenderKey = '';
      internals.mapRenderInvalidated = true;
      internals.viewConeRenderer.clear();
      board.forceRender();
    },
    preserveViewportCentre: (deltaWidth, deltaHeight) => {
      internals.camera.preserveViewportCentre(deltaWidth, deltaHeight);
    },
  };
}
