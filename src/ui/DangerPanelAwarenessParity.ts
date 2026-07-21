import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { getTacticalPositionSearchService } from '../core/tactical/TacticalPositionSearchService';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';

const VALUE_BY_LABEL = Object.freeze({
  'Текущая опасность': 'danger',
  'Подавление': 'suppression',
  'Защита позиции': 'protection',
  'Уверенность в угрозах': 'confidence',
} as const);

type PublishedMetric = typeof VALUE_BY_LABEL[keyof typeof VALUE_BY_LABEL];

/**
 * Keeps the legacy workspace panel on the same published subjective raster as
 * the map heatmap, Ctrl cell inspector and tactical-position search.
 */
export function syncDangerPanelFromAwareness(state: SimulationState): void {
  if (typeof document === 'undefined' || getSimulationLayerState(state).mode !== 'danger') return;
  const activeTab = document.querySelector<HTMLButtonElement>('.simulation-tabs [data-tab="danger"].active');
  const body = document.querySelector<HTMLElement>('.simulation-sidebar [data-role="sidebar-body"]');
  if (!activeTab || !body || body.hidden) return;

  const rows = findMetricRows(body);
  if (rows.size === 0) return;
  const unit = getSelectedUnit(state);
  const prepared = unit ? getTacticalPositionSearchService(state)?.readReadyWorldField(unit.id) ?? null : null;
  if (!unit || !prepared) {
    setMetric(rows, 'danger', 'Данные подготавливаются');
    setMetric(rows, 'suppression', '—');
    setMetric(rows, 'protection', '—');
    setMetric(rows, 'confidence', '—');
    return;
  }

  const x = Math.floor(unit.position.x);
  const y = Math.floor(unit.position.y);
  if (x < 0 || y < 0 || x >= prepared.field.width || y >= prepared.field.height) return;
  const index = y * prepared.field.width + x;
  setMetric(rows, 'danger', percent(prepared.field.danger[index] ?? 0));
  setMetric(rows, 'suppression', percent(prepared.field.suppression[index] ?? 0));
  setMetric(rows, 'protection', percent(prepared.field.expectedProtectionAgainstThreat[index] ?? 0));
  setMetric(rows, 'confidence', percent(prepared.field.threatConfidence));
}

function findMetricRows(root: HTMLElement): Map<PublishedMetric, HTMLElement> {
  const result = new Map<PublishedMetric, HTMLElement>();
  for (const row of root.querySelectorAll<HTMLElement>('.workspace-info-grid > div')) {
    const label = row.querySelector<HTMLElement>('span')?.textContent?.trim() ?? '';
    const metric = VALUE_BY_LABEL[label as keyof typeof VALUE_BY_LABEL];
    const value = row.querySelector<HTMLElement>('b');
    if (metric && value) result.set(metric, value);
  }
  return result;
}

function setMetric(rows: Map<PublishedMetric, HTMLElement>, metric: PublishedMetric, value: string): void {
  const element = rows.get(metric);
  if (element && element.textContent !== value) element.textContent = value;
}

function percent(value: number): string {
  const normalized = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
  return `${normalized} / 100`;
}
