import { Container, Graphics, Text } from 'pixi.js';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import { objectCenter } from '../core/cover/CoverEvaluation';
import { resolveObjectCoverProperties, type MapObject } from '../core/map/MapModel';
import { getSelectedMapObject, getSelectedPressureZone, getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';

const FIRE_COLOR = 0xff5d4a;
const SAFE_COLOR = 0x4fd37a;
const WARNING_COLOR = 0xffc457;

export class PixiCoverDirectionRenderer {
  readonly container = new Container();
  private lastKey = '';

  render(state: SimulationState): void {
    const key = buildRenderKey(state);
    if (key === this.lastKey) return;

    this.lastKey = key;
    this.container.removeChildren();

    const cover = getSelectedMapObject(state);
    const threat = getSelectedPressureZone(state);
    if (!cover || !threat) return;

    const cellSize = state.map.cellSize;
    const center = objectCenter(cover);
    const source = { x: threat.x, y: threat.y };
    const dx = center.x - source.x;
    const dy = center.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dx / length;
    const ny = dy / length;
    const safeOffset = Math.max(cover.widthCells, cover.heightCells) / 2 + 1.15;
    const safePoint = {
      x: center.x + nx * safeOffset,
      y: center.y + ny * safeOffset,
    };

    const graphics = new Graphics();
    drawArrow(graphics, source, center, cellSize, FIRE_COLOR, 4);
    drawArrow(graphics, center, safePoint, cellSize, SAFE_COLOR, 5);
    graphics.lineStyle(2, SAFE_COLOR, 0.9);
    graphics.beginFill(SAFE_COLOR, 0.13);
    graphics.drawCircle(safePoint.x * cellSize, safePoint.y * cellSize, Math.max(12, cellSize * 0.42));
    graphics.endFill();

    const unit = getSelectedUnit(state);
    if (unit) {
      const protectedNow = selectedCoverProtectsUnit(cover, source, unit.position, unit.behaviorRuntime.posture);
      graphics.lineStyle(3, protectedNow ? SAFE_COLOR : WARNING_COLOR, 0.9);
      graphics.moveTo(center.x * cellSize, center.y * cellSize);
      graphics.lineTo(unit.position.x * cellSize, unit.position.y * cellSize);

      if (!protectedNow) {
        const ux = unit.position.x * cellSize;
        const uy = unit.position.y * cellSize;
        graphics.moveTo(ux - 7, uy - 7);
        graphics.lineTo(ux + 7, uy + 7);
        graphics.moveTo(ux + 7, uy - 7);
        graphics.lineTo(ux - 7, uy + 7);
      }
    }

    this.container.addChild(graphics);
    this.container.addChild(createLabel('НАПРАВЛЕНИЕ ОГНЯ', source.x * cellSize + 8, source.y * cellSize - 24, FIRE_COLOR));
    this.container.addChild(createLabel('ЗАЩИЩЁННАЯ СТОРОНА', safePoint.x * cellSize + 8, safePoint.y * cellSize - 22, SAFE_COLOR));
  }
}

function buildRenderKey(state: SimulationState): string {
  const cover = getSelectedMapObject(state);
  const threat = getSelectedPressureZone(state);
  const unit = getSelectedUnit(state);
  if (!cover || !threat) return 'hidden';

  return [
    state.map.cellSize,
    cover.id,
    cover.x.toFixed(3),
    cover.y.toFixed(3),
    cover.widthCells.toFixed(3),
    cover.heightCells.toFixed(3),
    cover.rotationRadians.toFixed(3),
    threat.id,
    threat.x.toFixed(3),
    threat.y.toFixed(3),
    unit?.id ?? 'none',
    unit?.position.x.toFixed(3) ?? '',
    unit?.position.y.toFixed(3) ?? '',
    unit?.behaviorRuntime.posture ?? '',
  ].join(':');
}

function drawArrow(
  graphics: Graphics,
  start: { x: number; y: number },
  end: { x: number; y: number },
  cellSize: number,
  color: number,
  width: number,
): void {
  const x1 = start.x * cellSize;
  const y1 = start.y * cellSize;
  const x2 = end.x * cellSize;
  const y2 = end.y * cellSize;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = Math.max(10, cellSize * 0.35);

  graphics.lineStyle(width, color, 0.95);
  graphics.moveTo(x1, y1);
  graphics.lineTo(x2, y2);
  graphics.moveTo(x2, y2);
  graphics.lineTo(x2 - Math.cos(angle - Math.PI / 6) * headLength, y2 - Math.sin(angle - Math.PI / 6) * headLength);
  graphics.moveTo(x2, y2);
  graphics.lineTo(x2 - Math.cos(angle + Math.PI / 6) * headLength, y2 - Math.sin(angle + Math.PI / 6) * headLength);
}

function createLabel(text: string, x: number, y: number, color: number): Text {
  const label = new Text(text, {
    fontFamily: 'Arial, sans-serif',
    fontSize: 11,
    fontWeight: '700',
    fill: color,
    stroke: 0x101510,
    strokeThickness: 4,
  });
  label.position.set(x, y);
  return label;
}

function selectedCoverProtectsUnit(
  cover: MapObject,
  threat: { x: number; y: number },
  unit: { x: number; y: number },
  posture: UnitPosture,
): boolean {
  const properties = resolveObjectCoverProperties(cover);
  if (properties.coverProtection <= 0 || !postureFitsCover(posture, properties.coverPosture)) return false;

  const center = objectCenter(cover);
  const segment = distanceToSegment(center, threat, unit);
  const hitRadius = Math.max(0.3, Math.min(cover.widthCells, cover.heightCells) * 0.7);
  return segment.t > 0.05 && segment.t < 0.97 && segment.distance <= hitRadius;
}

function postureFitsCover(posture: UnitPosture, coverPosture: UnitPosture): boolean {
  const rank: Record<UnitPosture, number> = {
    prone: 0,
    crouched: 1,
    standing: 2,
  };
  return rank[posture] <= rank[coverPosture];
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): { distance: number; t: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) return { distance: Math.hypot(point.x - start.x, point.y - start.y), t: 0 };

  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projection = { x: start.x + dx * t, y: start.y + dy * t };
  return { distance: Math.hypot(point.x - projection.x, point.y - projection.y), t };
}
