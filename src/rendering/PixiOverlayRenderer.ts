import { Container, Graphics } from 'pixi.js';
import { gridToCellCenter } from '../core/map/MapModel';
import type { PressureZone } from '../core/pressure/PressureZone';
import type { SimulationState } from '../core/simulation/SimulationState';

export class PixiOverlayRenderer {
  readonly container = new Container();
  private readonly zoneContainer = new Container();
  private readonly dynamicContainer = new Container();
  private lastZoneKey = '';
  private lastDynamicKey = '';

  constructor() {
    this.container.addChild(this.zoneContainer, this.dynamicContainer);
  }

  render(state: SimulationState, showGrid = true, showPressureZones = true): void {
    this.renderZoneLayerIfNeeded(state, showPressureZones);
    this.renderDynamicLayerIfNeeded(state, showGrid);
  }

  private renderZoneLayerIfNeeded(state: SimulationState, showPressureZones: boolean): void {
    const nextKey = getZoneLayerKey(state, showPressureZones);

    if (nextKey === this.lastZoneKey) {
      return;
    }

    this.lastZoneKey = nextKey;
    this.zoneContainer.cacheAsBitmap = false;
    this.zoneContainer.removeChildren();

    if (showPressureZones) {
      drawPressureZones(this.zoneContainer, state.pressureZones, state.map.cellSize, state.editor.selectedZoneId);
      this.zoneContainer.cacheAsBitmap = state.editor.selectedZoneId === null;
    }
  }

  private renderDynamicLayerIfNeeded(state: SimulationState, showGrid: boolean): void {
    const nextKey = getDynamicLayerKey(state, showGrid);

    if (nextKey === this.lastDynamicKey) {
      return;
    }

    this.lastDynamicKey = nextKey;
    this.dynamicContainer.removeChildren();

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

      this.dynamicContainer.addChild(graphics);
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

      this.dynamicContainer.addChild(graphics);
    }
  }
}

function getZoneLayerKey(state: SimulationState, showPressureZones: boolean): string {
  if (!showPressureZones) {
    return 'zones:hidden';
  }

  return [
    `cell:${state.map.cellSize}`,
    `selected:${state.editor.selectedZoneId ?? 'none'}`,
    `zones:${state.pressureZones.map((zone) => [
      zone.id,
      zone.shape,
      zone.x.toFixed(3),
      zone.y.toFixed(3),
      zone.radiusCells.toFixed(3),
      zone.widthCells.toFixed(3),
      zone.heightCells.toFixed(3),
      zone.strength.toFixed(1),
    ].join(':')).join('|')}`,
  ].join(';');
}

function getDynamicLayerKey(state: SimulationState, showGrid: boolean): string {
  const mouse = state.mouseGridPosition
    ? `${state.mouseGridPosition.x.toFixed(2)}:${state.mouseGridPosition.y.toFixed(2)}`
    : 'none';
  const box = state.selectionBox
    ? `${state.selectionBox.start.x.toFixed(2)}:${state.selectionBox.start.y.toFixed(2)}:${state.selectionBox.current.x.toFixed(2)}:${state.selectionBox.current.y.toFixed(2)}`
    : 'none';

  return [
    `grid:${showGrid ? '1' : '0'}`,
    `mouse:${mouse}`,
    `box:${box}`,
    `cell:${state.map.cellSize}`,
  ].join(';');
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
