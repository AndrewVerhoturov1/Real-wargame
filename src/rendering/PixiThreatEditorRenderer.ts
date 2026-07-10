import { Container, Graphics, Text } from 'pixi.js';
import { resolvePressureZoneSettings, type PressureZone } from '../core/pressure/PressureZone';
import { getAiLabRuntime, type AiLabThreatHandle } from '../core/testing/AiLabRuntime';
import type { SimulationState } from '../core/simulation/SimulationState';

const HANDLE_COLOR = 0xffe49a;
const ACTIVE_COLOR = 0xffffff;
const DIRECTION_COLOR = 0xff6658;
const RANGE_COLOR = 0xffa544;
const ARC_COLOR = 0xffcc62;
const MIN_RANGE_COLOR = 0xcf8cff;

export class PixiThreatEditorRenderer {
  readonly container = new Container();
  private lastKey = '';

  render(state: SimulationState): void {
    const runtime = getAiLabRuntime(state);
    const zone = state.editor.selectedZoneId
      ? state.pressureZones.find((item) => item.id === state.editor.selectedZoneId)
      : undefined;
    const visible = Boolean(zone) && (state.editor.enabled || runtime.open);
    const key = visible && zone ? buildKey(zone, state.map.cellSize, runtime.hoveredHandle, runtime.drag?.handle ?? null) : 'hidden';
    if (key === this.lastKey) return;

    this.lastKey = key;
    this.container.removeChildren();
    if (!visible || !zone) return;

    const graphics = new Graphics();
    const labels: Text[] = [];
    const settings = resolvePressureZoneSettings(zone);
    const cellSize = state.map.cellSize;
    const center = { x: zone.x, y: zone.y };

    drawHandle(graphics, center, cellSize, 'move', runtime, HANDLE_COLOR);

    if (settings.mode === 'directional_fire') {
      const angle = radians(settings.directionDegrees);
      const direction = ray(center, angle, Math.max(1.5, Math.min(3, settings.rangeCells * 0.3)));
      const range = ray(center, angle, settings.rangeCells);
      const minRange = ray(center, angle, Math.max(0.45, settings.minRangeCells));
      const left = ray(center, angle - radians(settings.arcDegrees / 2), settings.rangeCells * 0.72);
      const right = ray(center, angle + radians(settings.arcDegrees / 2), settings.rangeCells * 0.72);

      drawGuide(graphics, center, direction, cellSize, DIRECTION_COLOR);
      drawHandle(graphics, direction, cellSize, 'direction', runtime, DIRECTION_COLOR);
      drawHandle(graphics, range, cellSize, 'range', runtime, RANGE_COLOR);
      drawHandle(graphics, left, cellSize, 'arc_left', runtime, ARC_COLOR);
      drawHandle(graphics, right, cellSize, 'arc_right', runtime, ARC_COLOR);
      if (settings.minRangeCells > 0.05) drawHandle(graphics, minRange, cellSize, 'min_range', runtime, MIN_RANGE_COLOR);

      labels.push(
        label('НАПРАВЛЕНИЕ', direction, cellSize, DIRECTION_COLOR, -16),
        label('ДАЛЬНОСТЬ', range, cellSize, RANGE_COLOR, -16),
        label('ШИРИНА СЕКТОРА', left, cellSize, ARC_COLOR, -18),
      );
      if (settings.minRangeCells > 0.05) labels.push(label('МЁРТВАЯ ЗОНА', minRange, cellSize, MIN_RANGE_COLOR, 18));
    } else if (zone.shape === 'circle') {
      const radius = { x: center.x + zone.radiusCells, y: center.y };
      drawGuide(graphics, center, radius, cellSize, RANGE_COLOR);
      drawHandle(graphics, radius, cellSize, 'radius', runtime, RANGE_COLOR);
      labels.push(label('РАДИУС', radius, cellSize, RANGE_COLOR, -16));
    } else {
      const rotation = radians(zone.rotationDegrees ?? 0);
      const width = local(center, zone.widthCells / 2, 0, rotation);
      const height = local(center, 0, zone.heightCells / 2, rotation);
      const rotate = local(center, 0, -zone.heightCells / 2 - 1, rotation);
      drawHandle(graphics, width, cellSize, 'rect_width', runtime, RANGE_COLOR);
      drawHandle(graphics, height, cellSize, 'rect_height', runtime, ARC_COLOR);
      drawHandle(graphics, rotate, cellSize, 'rect_rotate', runtime, DIRECTION_COLOR);
      drawGuide(graphics, center, rotate, cellSize, DIRECTION_COLOR);
      labels.push(
        label('ШИРИНА', width, cellSize, RANGE_COLOR, -16),
        label('ДЛИНА', height, cellSize, ARC_COLOR, -16),
        label('ПОВОРОТ', rotate, cellSize, DIRECTION_COLOR, -16),
      );
    }

    this.container.addChild(graphics, ...labels);
  }
}

function drawGuide(graphics: Graphics, start: { x: number; y: number }, end: { x: number; y: number }, cellSize: number, color: number): void {
  graphics.lineStyle(2, color, 0.82);
  graphics.moveTo(start.x * cellSize, start.y * cellSize);
  graphics.lineTo(end.x * cellSize, end.y * cellSize);
}

function drawHandle(graphics: Graphics, point: { x: number; y: number }, cellSize: number, handle: AiLabThreatHandle, runtime: ReturnType<typeof getAiLabRuntime>, color: number): void {
  const active = runtime.hoveredHandle === handle || runtime.drag?.handle === handle;
  const radius = active ? 9 : 7;
  graphics.lineStyle(active ? 3 : 2, active ? ACTIVE_COLOR : 0x171b15, 1);
  graphics.beginFill(active ? ACTIVE_COLOR : color, 0.98);
  if (handle === 'arc_left' || handle === 'arc_right') graphics.drawRect(point.x * cellSize - radius, point.y * cellSize - radius, radius * 2, radius * 2);
  else graphics.drawCircle(point.x * cellSize, point.y * cellSize, radius);
  graphics.endFill();
}

function label(text: string, point: { x: number; y: number }, cellSize: number, color: number, dy: number): Text {
  const item = new Text(text, { fontFamily: 'Arial, sans-serif', fontSize: 10, fontWeight: '700', fill: color, stroke: 0x111510, strokeThickness: 4 });
  item.anchor.set(0.5, 0.5);
  item.position.set(point.x * cellSize, point.y * cellSize + dy);
  return item;
}

function buildKey(zone: PressureZone, cellSize: number, hovered: AiLabThreatHandle | null, dragged: string | null): string {
  const settings = resolvePressureZoneSettings(zone);
  return [zone.id, cellSize, zone.x.toFixed(3), zone.y.toFixed(3), zone.shape, settings.mode, zone.radiusCells.toFixed(3), zone.widthCells.toFixed(3), zone.heightCells.toFixed(3), (zone.rotationDegrees ?? 0).toFixed(2), settings.directionDegrees.toFixed(2), settings.arcDegrees.toFixed(2), settings.rangeCells.toFixed(3), settings.minRangeCells.toFixed(3), hovered ?? '', dragged ?? ''].join(':');
}
function ray(center: { x: number; y: number }, angle: number, length: number): { x: number; y: number } { return { x: center.x + Math.cos(angle) * length, y: center.y + Math.sin(angle) * length }; }
function local(center: { x: number; y: number }, x: number, y: number, rotation: number): { x: number; y: number } { return { x: center.x + x * Math.cos(rotation) - y * Math.sin(rotation), y: center.y + x * Math.sin(rotation) + y * Math.cos(rotation) }; }
function radians(degrees: number): number { return degrees * Math.PI / 180; }
