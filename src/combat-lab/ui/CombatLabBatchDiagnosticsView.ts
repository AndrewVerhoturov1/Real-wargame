import type { CombatLabBatchResultV1 } from '../../core/testing/combat-lab';
import { combatLabMetricLabelRu } from './CombatLabMetricLabels';

export class CombatLabBatchDiagnosticsView {
  readonly root = document.createElement('section');

  constructor(host: HTMLElement) {
    this.root.className = 'combat-lab-batch-diagnostics-view';
    host.append(this.root);
  }

  clear(): void {
    this.root.replaceChildren();
  }

  render(result: CombatLabBatchResultV1): void {
    const diagnostics = result.diagnostics;
    const heading = document.createElement('h3');
    heading.textContent = 'Диагностика серии';

    const cards = document.createElement('div');
    cards.className = 'combat-lab-batch-diagnostic-cards';
    cards.append(
      card('Выполнено', diagnostics.completedRuns),
      card('Ошибки', diagnostics.failureCount),
      card('Остановлено лимитом', diagnostics.timeLimitStopCount),
      card('Уникальные seed', diagnostics.uniqueSeedCount),
      card('Уникальные итоги', diagnostics.uniqueFinalStateDigestCount),
    );

    const warnings = document.createElement('div');
    warnings.className = 'combat-lab-batch-diagnostic-warnings';
    if (diagnostics.uniqueSeedCount < result.runCount) {
      warnings.append(warning('Не все прогоны используют уникальные seed. Для исследования разброса выберите последовательный режим или явный список без повторов.'));
    }
    if (
      diagnostics.uniqueSeedCount > 1
      && diagnostics.uniqueFinalStateDigestCount < diagnostics.uniqueSeedCount
    ) {
      warnings.append(warning('Разные seed дали одинаковые итоговые отпечатки. Это не ошибка само по себе: проверьте выбранные метрики и представительные прогоны.'));
    }
    if (diagnostics.timeLimitStopCount > 0) {
      warnings.append(warning(`Лимит времени остановил ${diagnostics.timeLimitStopCount} прогонов. Увеличьте длительность только после проверки программы эксперимента.`));
    }

    const table = document.createElement('table');
    table.className = 'combat-lab-batch-statistics-table';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of ['Метрика', 'Минимум', 'Максимум', 'Медиана', 'Среднее', 'Станд. отклонение', 'Выборок']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      headRow.append(cell);
    }
    head.append(headRow);
    const body = document.createElement('tbody');
    for (const [metricId, summary] of Object.entries(result.metrics)) {
      const row = document.createElement('tr');
      row.append(
        textCell(combatLabMetricLabelRu(metricId)),
        numberCell(summary.minimum),
        numberCell(summary.maximum),
        numberCell(summary.median),
        numberCell(summary.mean),
        numberCell(summary.standardDeviation),
        numberCell(summary.sampleCount),
      );
      body.append(row);
    }
    table.append(head, body);

    this.root.replaceChildren(heading, cards, warnings, table);
  }

  destroy(): void {
    this.root.remove();
  }
}

function card(label: string, value: number): HTMLElement {
  const root = document.createElement('div');
  const title = document.createElement('span');
  title.textContent = label;
  const number = document.createElement('strong');
  number.textContent = String(value);
  root.append(title, number);
  return root;
}

function warning(text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = 'combat-lab-batch-warning';
  element.textContent = text;
  return element;
}

function textCell(value: string): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.textContent = value;
  return cell;
}

function numberCell(value: number): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.textContent = formatNumber(value);
  return cell;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace('.', ',');
}
