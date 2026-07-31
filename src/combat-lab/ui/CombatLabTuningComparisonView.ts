import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab';
import {
  getCombatLabQuickParameterDescriptor,
  isCombatLabQuickParameterId,
} from '../parameters/CombatLabQuickParameterRegistry';
import type { CombatLabTuningComparisonRowV1 } from '../parameters/CombatLabTuningSnapshotStore';
import { CombatLabTuningSnapshotStore } from '../parameters/CombatLabTuningSnapshotStore';
import { combatLabMetricLabelRu } from './CombatLabMetricLabels';

export interface CombatLabTuningComparisonViewOptionsV1 {
  readonly host: HTMLElement;
  readonly store: CombatLabTuningSnapshotStore;
}

export class CombatLabTuningComparisonView {
  private destroyed = false;

  constructor(private readonly options: CombatLabTuningComparisonViewOptionsV1) {}

  refresh(experiment: CombatLabExperimentV1, roleId: string): void {
    if (this.destroyed) return;
    const comparison = this.options.store.compare(experiment, roleId);
    if (!comparison) {
      this.options.host.replaceChildren(empty('Сохраните снимки A и B, чтобы сравнить параметры и результаты.'));
      return;
    }
    const root = node('section', 'combat-lab-tuning-comparison');
    const header = node('div', 'combat-lab-tuning-comparison-header');
    header.append(
      snapshotCard('A', comparison.snapshotA.seed, comparison.snapshotA.experimentRevision, comparison.snapshotA.timestampMs),
      snapshotCard('B', comparison.snapshotB.seed, comparison.snapshotB.experimentRevision, comparison.snapshotB.timestampMs),
    );
    root.append(header);
    if (comparison.invalidReasonRu) {
      root.append(node('div', 'combat-lab-quick-parameters-notice is-error', comparison.invalidReasonRu));
    }
    if (comparison.differentSeeds) {
      root.append(node(
        'div',
        'combat-lab-quick-parameters-notice is-warning',
        'Seed различаются. Изменения метрик нельзя приписывать только параметрам бойца.',
      ));
    }
    root.append(
      comparisonTable('Параметры бойца', comparison.valueRows, parameterLabel),
      comparisonTable('Метрики визуального прогона', comparison.metricRows, combatLabMetricLabelRu),
    );
    this.options.host.replaceChildren(root);
  }

  clear(): void {
    if (this.destroyed) return;
    this.options.host.replaceChildren(empty('Снимки A/B очищены.'));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.host.replaceChildren();
  }
}

function comparisonTable(
  titleRu: string,
  rows: readonly CombatLabTuningComparisonRowV1[],
  label: (id: string) => string,
): HTMLElement {
  const section = node('section', 'combat-lab-tuning-comparison-section');
  section.append(node('h4', '', titleRu));
  if (rows.length === 0) {
    section.append(empty('Нет данных для сравнения.'));
    return section;
  }
  const table = document.createElement('table');
  table.className = 'combat-lab-tuning-comparison-table';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const value of ['Показатель', 'A', 'B', 'Δ B−A']) headRow.append(node('th', '', value));
  head.append(headRow);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const line = document.createElement('tr');
    line.append(
      node('th', '', label(row.id)),
      node('td', '', formatNumber(row.valueA)),
      node('td', '', formatNumber(row.valueB)),
      node('td', '', formatDelta(row.delta)),
    );
    body.append(line);
  }
  table.append(head, body);
  section.append(table);
  return section;
}

function snapshotCard(slot: string, seed: number, revision: number, timestampMs: number): HTMLElement {
  const card = node('div', 'combat-lab-tuning-snapshot-card');
  card.append(
    node('strong', '', `Снимок ${slot}`),
    node('span', '', `seed ${seed}`),
    node('span', '', `ревизия ${revision}`),
    node('time', '', new Date(timestampMs).toLocaleString('ru-RU')),
  );
  return card;
}

function parameterLabel(id: string): string {
  return isCombatLabQuickParameterId(id) ? getCombatLabQuickParameterDescriptor(id).labelRu : id;
}

function formatNumber(value: number | null): string {
  if (value === null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function formatDelta(value: number | null): string {
  if (value === null) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatNumber(value)}`;
}

function empty(text: string): HTMLElement {
  return node('div', 'combat-lab-empty-tab', text);
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
