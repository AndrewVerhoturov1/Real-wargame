import { Container, Graphics, Text } from 'pixi.js';
import { buildSoldierAwarenessReport, type SoldierAwarenessCell } from '../core/knowledge/SoldierAwarenessGrid';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';
import type { UnitModel } from '../core/units/UnitModel';

type VisibleAwarenessMode = 'danger' | 'stealth';

const mapIdentity = new WeakMap<object, number>();
let nextMapIdentity = 1;

export class PixiAwarenessHeatmapRenderer {
  readonly container = new Container();
  private lastKey = '';

  render(state: SimulationState): void {
    const simulationLayer = getSimulationLayerState(state);
    const awarenessMode = simulationLayer.mode === 'danger' ? 'danger' : simulationLayer.mode === 'stealth' ? 'stealth' : 'off';
    const unit = state.selectedUnitId ? state.units.find((item) => item.id === state.selectedUnitId) : undefined;
    if (state.editor.enabled || awarenessMode === 'off' || !unit) {
      if (this.lastKey !== 'hidden') {
        this.lastKey = 'hidden';
        clearContainer(this.container);
      }
      return;
    }

    // Do not build the expensive full-map report on every animation frame.
    // Orders change often, but they do not change the heatmap cells themselves.
    const key = buildAwarenessRenderKey(state, unit, awarenessMode);
    if (key === this.lastKey) return;

    const report = buildSoldierAwarenessReport(state, unit);
    this.lastKey = key;
    clearContainer(this.container);

    const graphics = new Graphics();
    const size = state.map.cellSize;
    for (const cell of report.cells) drawCell(graphics, cell, awarenessMode, size);

    if (awarenessMode === 'danger') {
      for (const [index, best] of report.bestSafePositions.slice(0, 5).entries()) {
        const x = best.position.x * size;
        const y = best.position.y * size;
        graphics.lineStyle(index === 0 ? 4 : 2, 0xefff9a, 0.95);
        graphics.beginFill(0x4ce78a, index === 0 ? 0.45 : 0.2);
        graphics.drawCircle(x, y, index === 0 ? 12 : 8);
        graphics.endFill();
      }
    }

    const title = new Text(`СЛОЙ БОЙЦА: ${modeLabel(awarenessMode)}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 12,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: 0x111510,
      strokeThickness: 4,
    });
    title.position.set(8, 8);
    this.container.addChild(graphics, title);
  }
}

export function buildAwarenessRenderKey(
  state: SimulationState,
  unit: UnitModel,
  mode: VisibleAwarenessMode,
): string {
  const unitCellX = Math.floor(unit.position.x);
  const unitCellY = Math.floor(unit.position.y);

  return [
    `mode:${mode}`,
    `map:${getMapIdentity(state.map)}`,
    `size:${state.map.width}x${state.map.height}`,
    `cellSize:${state.map.cellSize}`,
    `unit:${unit.id}`,
    `unitCell:${unitCellX}:${unitCellY}`,
    `posture:${unit.behaviorRuntime.posture}`,
    `knowledge:${unit.tacticalKnowledge.revision}`,
  ].join(';');
}

function clearContainer(container: Container): void {
  for (const child of container.removeChildren()) child.destroy({ children: true });
}

function getMapIdentity(map: object): number {
  const existing = mapIdentity.get(map);
  if (existing !== undefined) return existing;
  const identity = nextMapIdentity;
  nextMapIdentity += 1;
  mapIdentity.set(map, identity);
  return identity;
}

function drawCell(
  graphics: Graphics,
  cell: SoldierAwarenessCell,
  mode: VisibleAwarenessMode,
  cellSize: number,
): void {
  const metric = metricForMode(cell, mode);
  if (metric.value <= 2) return;
  graphics.beginFill(metric.color, metric.alpha);
  graphics.drawRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
  graphics.endFill();
}

function metricForMode(
  cell: SoldierAwarenessCell,
  mode: VisibleAwarenessMode,
): { value: number; color: number; alpha: number } {
  if (mode === 'danger') return { value: cell.danger, color: dangerColor(cell.danger), alpha: alpha(cell.danger) };
  return { value: cell.concealment, color: stealthColor(cell.concealment), alpha: alpha(cell.concealment) };
}

function dangerColor(value: number): number {
  if (value >= 70) return 0xe83d32;
  if (value >= 40) return 0xff7a31;
  return 0xf2c84b;
}

function stealthColor(value: number): number {
  if (value >= 75) return 0x1c6b45;
  if (value >= 50) return 0x3da85f;
  if (value >= 25) return 0xd7b94b;
  return 0xd97732;
}

function alpha(value: number): number {
  return Math.min(0.55, 0.08 + value / 100 * 0.46);
}

function modeLabel(mode: VisibleAwarenessMode): string {
  return mode === 'danger' ? 'опасность' : 'скрытность';
}
