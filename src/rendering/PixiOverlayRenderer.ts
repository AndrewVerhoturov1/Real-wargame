import { Container, Graphics } from 'pixi.js';
import { gridToCellCenter } from '../core/map/MapModel';
import type { PressureZone } from '../core/pressure/PressureZone';
import type { SimulationState } from '../core/simulation/SimulationState';

export class PixiOverlayRenderer {
  readonly container = new Container();

  render(state: SimulationState, showGrid = true, showPressureZones = true): void {
    this.container.removeChildren();

    if (showPressureZones) {
      drawPressureZones(this.container, state.pressureZones, state.map.cellSize, state.editor.selectedZoneId);
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

function drawPressureZones(
  container: Container,
  zones: PressureZone[],
  cellSize: number,
  selectedZoneId: string | null,
): void {
  for (const zone of zones) {
    const graphics = new Graphics();
    const alpha = Math.max(0.08, Math.min(0.28, zone.strength / 350));
    const isSelected = zone.id === selectedZoneId;

    graphics.lineStyle(isSelected ? 4 : 2, isSelected ? 0xfff2a8 : 0xb6633c, isSelected ? 0.95 : 0.75);
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

    if (isSelected) {
      drawZoneHandles(graphics, zone, cellSize);
    }

    container.addChild(graphics);
  }
}

function drawZoneHandles(graphics: Graphics, zone: PressureZone, cellSize: number): void {
  const handleSize = 8;

  graphics.beginFill(0xfff2a8, 1);

  if (zone.shape === 'circle') {
    for (const [x, y] of [
      [zone.x + zone.radiusCells, zone.y],
      [zone.x - zone.radiusCells, zone.y],
      [zone.x, zone.y + zone.radiusCells],
      [zone.x, zone.y - zone.radiusCells],
    ] as Array<[number, number]>) {
      graphics.drawRect(x * cellSize - handleSize / 2, y * cellSize - handleSize / 2, handleSize, handleSize);
    }
    graphics.endFill();
    return;
  }

  const left = (zone.x - zone.widthCells / 2) * cellSize;
  const right = (zone.x + zone.widthCells / 2) * cellSize;
  const top = (zone.y - zone.heightCells / 2) * cellSize;
  const bottom = (zone.y + zone.heightCells / 2) * cellSize;

  for (const [x, y] of [
    [left, top],
    [(left + right) / 2, top],
    [right, top],
    [right, (top + bottom) / 2],
    [right, bottom],
    [(left + right) / 2, bottom],
    [left, bottom],
    [left, (top + bottom) / 2],
  ] as Array<[number, number]>) {
    graphics.drawRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
  }

  graphics.endFill();
}
