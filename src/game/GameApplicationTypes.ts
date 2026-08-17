import type { Container, Ticker } from 'pixi.js';
import type { SimulationState } from '../core/simulation/SimulationState';
import type { PixiTacticalBoardApp } from '../rendering/PixiApp';
import type { EntityContextMenuRoutes } from '../ui/EntityContextMenu';

export type GameApplicationMode = 'game' | 'combat-lab';

export interface GameApplicationElements {
  readonly root: HTMLElement;
  readonly debugPanel: HTMLElement;
  readonly languageToggle: HTMLButtonElement;
  readonly gridToggle: HTMLButtonElement;
  readonly visionToggle: HTMLButtonElement;
  readonly heightToggle: HTMLButtonElement;
  readonly pauseToggle: HTMLButtonElement;
  readonly aiEditorOpenButton: HTMLButtonElement;
}

export interface GamePauseController {
  isPaused(): boolean;
  toggle(): void;
  setPaused(value: boolean): void;
}

export interface GameApplicationContext {
  readonly state: SimulationState;
  readonly board: PixiTacticalBoardApp;
  readonly forceRender: () => void;
  readonly addTickerListener: (listener: (ticker: Ticker) => void) => () => void;
  readonly getWorldContainer: () => Container;
  readonly restartStateBoundServices: () => void;
}

export interface GameApplicationExtension {
  destroy(): void;
}

export interface GameApplicationOptions {
  readonly mode: GameApplicationMode;
  readonly state: SimulationState;
  readonly elements: GameApplicationElements;
  readonly pauseController?: GamePauseController;
  readonly entityContextMenuRoutes?: EntityContextMenuRoutes;
  readonly installExtension?: (
    context: GameApplicationContext,
  ) => GameApplicationExtension | Promise<GameApplicationExtension>;
}
