import { Container, Graphics, Text } from 'pixi.js';
import { buildSoldierAwarenessReport, type SoldierAwarenessCell } from '../core/knowledge/SoldierAwarenessGrid';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';

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
        this.container.removeChildren();
      }
      return;
    }

    const report = buildSoldierAwarenessReport(state, unit);
    const key = `${report.cacheKey}:${awarenessMode}:${state.map.cellSize}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.container.removeChildren();

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

function drawCell(
  graphics: Graphics,
  cell: SoldierAwarenessCell,
  mode: 'off' | 'danger' | 'stealth',
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
  mode: 'off' | 'danger' | 'stealth',
): { value: number; color: number; alpha: number } {
  if (mode === 'danger') return { value: cell.danger, color: dangerColor(cell.danger), alpha: alpha(cell.danger) };
  if (mode === 'stealth') return { value: cell.concealment, color: stealthColor(cell.concealment), alpha: alpha(cell.concealment) };
  return { value: 0, color: 0x000000, alpha: 0 };
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

function modeLabel(mode: 'off' | 'danger' | 'stealth'): string {
  const labels = {
    off: 'выключен',
    danger: 'опасность',
    stealth: 'скрытность',
  } as const;
  return labels[mode];
}
