import { Container, Graphics, Text } from 'pixi.js';
import { buildUnitKnowledgeReport } from '../core/knowledge/UnitKnowledge';
import { gridToCellCenter } from '../core/map/MapModel';
import type { PressureZone } from '../core/pressure/PressureZone';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { getKnowledgeOverlayState, getVisibilityProbeState } from '../core/ui/RuntimeUiState';
import { computeLineOfSight } from '../core/visibility/LineOfSight';

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

    drawKnowledgeOverlay(this.dynamicContainer, state);
    drawVisibilityProbe(this.dynamicContainer, state);

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

function drawKnowledgeOverlay(container: Container, state: SimulationState): void {
  const overlay = getKnowledgeOverlayState(state);
  const unit = getSelectedUnit(state);

  if (!overlay.active || !unit) {
    return;
  }

  const report = buildUnitKnowledgeReport(state, unit);
  const graphics = new Graphics();
  const cellSize = state.map.cellSize;

  graphics.beginFill(0x4fbf72, 0.055);
  graphics.lineStyle(1, 0x4fbf72, 0.2);
  graphics.drawCircle(unit.position.x * cellSize, unit.position.y * cellSize, unit.viewRangeCells * cellSize);
  graphics.endFill();

  for (const cover of report.planCovers) {
    graphics.lineStyle(2, 0xfff2a8, 0.75);
    graphics.beginFill(0xfff2a8, 0.12);
    graphics.drawRoundedRect(cover.x * cellSize - 6, cover.y * cellSize - 6, 12, 12, 3);
    graphics.endFill();
  }

  for (const cover of report.nearbyCovers) {
    graphics.lineStyle(2, 0xfff2a8, 0.95);
    graphics.beginFill(0xfff2a8, 0.24);
    graphics.drawCircle(cover.x * cellSize, cover.y * cellSize, 7);
    graphics.endFill();
  }

  for (const danger of report.dangers) {
    graphics.lineStyle(2, 0xff4e3d, 0.9);
    graphics.beginFill(0xff4e3d, 0.12);
    graphics.drawCircle(danger.x * cellSize, danger.y * cellSize, 10);
    graphics.endFill();
    graphics.moveTo(danger.x * cellSize - 7, danger.y * cellSize - 7);
    graphics.lineTo(danger.x * cellSize + 7, danger.y * cellSize + 7);
    graphics.moveTo(danger.x * cellSize + 7, danger.y * cellSize - 7);
    graphics.lineTo(danger.x * cellSize - 7, danger.y * cellSize + 7);
  }

  container.addChild(graphics);
}

function drawVisibilityProbe(container: Container, state: SimulationState): void {
  const probe = getVisibilityProbeState(state);
  const unit = getSelectedUnit(state);

  if (!probe.active || !probe.target || !unit) {
    return;
  }

  const result = computeLineOfSight(state.map, unit, probe.target);
  const cellSize = state.map.cellSize;
  const graphics = new Graphics();
  const origin = result.origin;
  const target = result.target;
  const visibleEnd = result.blockedAt ?? target;

  graphics.lineStyle(3, 0x2dff55, 0.95);
  graphics.moveTo(origin.x * cellSize, origin.y * cellSize);
  graphics.lineTo(visibleEnd.x * cellSize, visibleEnd.y * cellSize);

  if (result.blocked && result.blockedAt) {
    graphics.lineStyle(3, 0xff3535, 0.95);
    graphics.moveTo(result.blockedAt.x * cellSize, result.blockedAt.y * cellSize);
    graphics.lineTo(target.x * cellSize, target.y * cellSize);

    graphics.lineStyle(2, 0xff3535, 1);
    graphics.drawCircle(result.blockedAt.x * cellSize, result.blockedAt.y * cellSize, 6);
    graphics.moveTo(result.blockedAt.x * cellSize - 7, result.blockedAt.y * cellSize - 7);
    graphics.lineTo(result.blockedAt.x * cellSize + 7, result.blockedAt.y * cellSize + 7);
    graphics.moveTo(result.blockedAt.x * cellSize + 7, result.blockedAt.y * cellSize - 7);
    graphics.lineTo(result.blockedAt.x * cellSize - 7, result.blockedAt.y * cellSize + 7);
  }

  container.addChild(graphics);

  const text = new Text({
    text: result.blocked
      ? `До курсора: ${Math.round(result.totalDistanceMeters)} м\nВидно: ${Math.round(result.visibleDistanceMeters)} м\nПреграда: ${result.blockerReasonRu}`
      : `До курсора: ${Math.round(result.totalDistanceMeters)} м\nПрямая видимость есть`,
    style: {
      fill: 0xfff2a8,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 12,
      fontWeight: '700',
      stroke: 0x10160f,
      strokeThickness: 3,
    },
  });
  text.position.set(target.x * cellSize + 10, target.y * cellSize + 10);
  container.addChild(text);
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
  const knowledgeOverlay = getKnowledgeOverlayState(state).active ? '1' : '0';
  const probe = getVisibilityProbeState(state);
  const probeKey = probe.active && probe.target
    ? `${probe.target.x.toFixed(2)}:${probe.target.y.toFixed(2)}`
    : 'off';
  const selectedUnit = state.selectedUnitId ?? 'none';

  return [
    `grid:${showGrid ? '1' : '0'}`,
    `mouse:${mouse}`,
    `box:${box}`,
    `cell:${state.map.cellSize}`,
    `selectedUnit:${selectedUnit}`,
    `knowledge:${knowledgeOverlay}`,
    `probe:${probeKey}`,
    `objects:${state.map.objects.length}`,
    `zones:${state.pressureZones.length}`,
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
