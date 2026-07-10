import { Container, Graphics, Text } from 'pixi.js';
import { buildSoldierAwarenessReport, type SoldierAwarenessCell } from '../core/knowledge/SoldierAwarenessGrid';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getAiLabRuntime } from '../core/testing/AiLabRuntime';

export class PixiAwarenessHeatmapRenderer {
  readonly container = new Container();
  private lastKey = '';

  render(state: SimulationState): void {
    const runtime = getAiLabRuntime(state);
    const unit = state.selectedUnitId ? state.units.find((item) => item.id === state.selectedUnitId) : undefined;
    if (!runtime.open || runtime.awarenessMode === 'off' || !unit) {
      if (this.lastKey !== 'hidden') {
        this.lastKey = 'hidden';
        this.container.removeChildren();
      }
      return;
    }

    const report = buildSoldierAwarenessReport(state, unit);
    const key = `${report.cacheKey}:${runtime.awarenessMode}:${state.map.cellSize}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.container.removeChildren();

    const graphics = new Graphics();
    const size = state.map.cellSize;
    for (const cell of report.cells) drawCell(graphics, cell, runtime.awarenessMode, size);

    for (const [index, best] of report.bestSafePositions.slice(0, 5).entries()) {
      const x = best.position.x * size;
      const y = best.position.y * size;
      graphics.lineStyle(index === 0 ? 4 : 2, 0xefff9a, 0.95);
      graphics.beginFill(0x4ce78a, index === 0 ? 0.45 : 0.2);
      graphics.drawCircle(x, y, index === 0 ? 12 : 8);
      graphics.endFill();
    }

    const title = new Text(`КАРТА БОЙЦА: ${modeLabel(runtime.awarenessMode)}`, {
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

function drawCell(
  graphics: Graphics,
  cell: SoldierAwarenessCell,
  mode: ReturnType<typeof getAiLabRuntime>['awarenessMode'],
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
  mode: ReturnType<typeof getAiLabRuntime>['awarenessMode'],
): { value: number; color: number; alpha: number } {
  if (mode === 'danger') return { value: cell.danger, color: dangerColor(cell.danger), alpha: alpha(cell.danger) };
  if (mode === 'cover') return { value: cell.expectedProtection, color: 0x42d87a, alpha: alpha(cell.expectedProtection) };
  if (mode === 'safe') return { value: cell.safety, color: 0x67f18f, alpha: alpha(cell.safety) };
  if (mode === 'uncertainty') return { value: cell.uncertainty, color: 0xffd55f, alpha: alpha(cell.uncertainty) };
  if (mode === 'objective') {
    const value = Math.max(cell.expectedProtection, cell.concealment);
    return { value, color: cell.expectedProtection >= cell.concealment ? 0x47c97a : 0x4cb6e8, alpha: alpha(value) };
  }

  if (cell.danger >= 28) return { value: cell.danger, color: dangerColor(cell.danger), alpha: alpha(cell.danger) };
  if (cell.safety >= 35) return { value: cell.safety, color: 0x55df83, alpha: alpha(cell.safety) };
  return { value: cell.uncertainty, color: 0xffd55f, alpha: alpha(cell.uncertainty) * 0.75 };
}

function dangerColor(value: number): number {
  if (value >= 70) return 0xe83d32;
  if (value >= 40) return 0xff7a31;
  return 0xf2c84b;
}

function alpha(value: number): number {
  return Math.min(0.55, 0.08 + value / 100 * 0.46);
}

function modeLabel(mode: ReturnType<typeof getAiLabRuntime>['awarenessMode']): string {
  const labels = {
    off: 'выключена',
    all: 'угрозы и безопасные места',
    danger: 'опасность',
    cover: 'защита',
    safe: 'безопасные позиции',
    uncertainty: 'неопределённость знаний',
    objective: 'объективные свойства местности',
  } as const;
  return labels[mode];
}
