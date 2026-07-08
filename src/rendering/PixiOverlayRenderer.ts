import { Container, Graphics } from 'pixi.js';
import { gridToCellCenter } from '../core/map/MapModel';
import type { PressureZone } from '../core/pressure/PressureZone';
import type { SimulationState } from '../core/simulation/SimulationState';

export class PixiOverlayRenderer {
  readonly container = new Container();

  render(state: SimulationState, showGrid = true, showPressureZones = true): void {
    this.container.removeChildren();

    if (showPressureZones) {
      drawPressureZones(this.container, state.pressureZones, state.map.cellSize);
    }

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

function drawPressureZones(container: Container, zones: PressureZone[], cellSize: number): void {
  for (const zone of zones) {
    const graphics = new Graphics();
    const alpha = Math.max(0.08, Math.min(0.28, zone.strength / 350));

    graphics.lineStyle(2, 0xb6633c, 0.75);
    graphics.beginFill(0xb6633c, alpha);

    if (zone.shape === 'circle') {
      graphics.drawCircle(zone.x * cellSize, zone.y * cellSize, zone.radiusCells * cellSize);
    } else {
      graphics.drawRect(
        (zone.x - zone.widthCells / 2) * cellSize,
        (zone.y - zone.heightCells / 2) * cellSize,
        zone.widthCells * cellSize,
        zone.heightCells * cellSize,
      );
    }

    graphics.endFill();
    container.addChild(graphics);
  }
}
