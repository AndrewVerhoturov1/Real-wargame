import { Container, Graphics } from 'pixi.js';
import { gridToCellCenter } from '../core/map/MapModel';
import type { SimulationState } from '../core/simulation/SimulationState';

export class PixiOverlayRenderer {
  readonly container = new Container();

  render(state: SimulationState, showGrid = true): void {
    this.container.removeChildren();

    if (showGrid && state.mouseGridPosition) {
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

    if (state.selectionBox) {
      const { map } = state;
      const minX = Math.min(state.selectionBox.start.x, state.selectionBox.current.x) * map.cellSize;
      const minY = Math.min(state.selectionBox.start.y, state.selectionBox.current.y) * map.cellSize;
      const maxX = Math.max(state.selectionBox.start.x, state.selectionBox.current.x) * map.cellSize;
      const maxY = Math.max(state.selectionBox.start.y, state.selectionBox.current.y) * map.cellSize;
      const graphics = new Graphics();

      graphics.lineStyle(2, 0xfff2a8, 0.9);
      graphics.beginFill(0xfff2a8, 0.08);
      graphics.drawRect(minX, minY, maxX - minX, maxY - minY);
      graphics.endFill();

      this.container.addChild(graphics);
    }
  }
}
