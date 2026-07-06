import { Container, Graphics } from 'pixi.js';
import { gridToCellCenter, type TacticalMap } from '../core/map/MapModel';
import type { SimulationState } from '../core/simulation/SimulationState';

export class PixiOverlayRenderer {
  readonly container = new Container();

  render(state: SimulationState): void {
    this.container.removeChildren();

    if (!state.mouseGridPosition) {
      return;
    }

    const { map } = state;
    const cell = gridToCellCenter(map, state.mouseGridPosition);
    const graphics = new Graphics();

    graphics.lineStyle(2, 0xfff2a8, 0.5);
    graphics.drawRect(
      (cell.x - 0.5) * map.cellSize,
      (cell.y - 0.5) * map.cellSize,
      map.cellSize,
      map.cellSize,
    );

    this.container.addChild(graphics);
  }
}
