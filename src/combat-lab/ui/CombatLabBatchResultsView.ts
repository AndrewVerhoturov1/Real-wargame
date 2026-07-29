import type {
  CombatLabBatchResultV1,
  CombatLabRepresentativeRunV1,
} from '../../core/testing/combat-lab/experiment/CombatLabBatchContracts';
import { combatLabMetricLabelRu } from './CombatLabMetricLabels';
import { CombatLabMetricDistributionView } from './CombatLabMetricDistributionView';

export interface CombatLabBatchResultsViewOptions {
  readonly host: HTMLElement;
  readonly onReplayRepresentative: (representative: CombatLabRepresentativeRunV1) => void;
  readonly metricLabelRu?: (metricId: string) => string;
}

export class CombatLabBatchResultsView {
  private readonly root = document.createElement('div');
  private readonly metricLabelRu: (metricId: string) => string;
  private readonly distributions: CombatLabMetricDistributionView[] = [];

  constructor(private readonly options: CombatLabBatchResultsViewOptions) {
    this.metricLabelRu = options.metricLabelRu ?? combatLabMetricLabelRu;
    this.root.className = 'combat-lab-batch-results';
    options.host.replaceChildren(this.root);
  }

  render(result: CombatLabBatchResultV1): void {
    this.clearDistributions();
    const heading = element('h3', 'combat-lab-batch-results__title', 'Результаты серии');
    const summary = element('div', 'combat-lab-batch-results__summary');
    summary.append(
      summaryCard('Прогоны', formatInteger(result.runCount)),
      summaryCard('Успех', `${formatInteger(result.successCount)} · ${formatPercent(result.successRate)}`),
      summaryCard('Неудачи', formatInteger(result.failureCount)),
    );
    appendMetricCard(summary, result, 'simulatedSeconds', 'Среднее время');
    appendMetricCard(summary, result, 'roundsConsumed', 'Средний расход');
    appendMetricCard(summary, result, 'hits', 'Средние попадания');
    appendMetricCard(summary, result, 'misses', 'Средние промахи');

    const failureSection = element('section', 'combat-lab-batch-results__failures');
    failureSection.append(element('h4', '', 'Причины неудач'));
    const failureEntries = Object.entries(result.failureReasons)
      .sort(([leftReason, leftCount], [rightReason, rightCount]) => rightCount - leftCount || leftReason.localeCompare(rightReason));
    failureSection.append(failureEntries.length === 0
      ? element('p', 'combat-lab-batch-results__empty', 'Неудачных прогонов нет.')
      : element('div', 'combat-lab-batch-results__failure-list', failureEntries.map(([reason, count]) => `${reason}: ${count}`).join(' · ')));

    const distributionHost = element('div', 'combat-lab-batch-results__distributions');
    for (const [metricId, distribution] of Object.entries(result.metrics)) {
      const view = new CombatLabMetricDistributionView();
      view.render(metricId === 'simulatedSeconds' ? 'Время прогона, с' : this.metricLabelRu(metricId), distribution);
      this.distributions.push(view);
      distributionHost.append(view.element);
    }

    const representatives = element('section', 'combat-lab-batch-results__representatives');
    representatives.append(element('h4', '', 'Характерные прогоны'));
    const cards = element('div', 'combat-lab-batch-results__representative-list');
    for (const representative of result.representatives) {
      const card = element('article', 'combat-lab-batch-representative');
      card.append(
        element('strong', '', representativeTitle(result, representative)),
        element('span', '', `Seed ${representative.seed} · ${formatSeconds(representative.simulatedSeconds)}`),
      );
      const replay = document.createElement('button');
      replay.type = 'button';
      replay.textContent = 'Повторить визуально';
      replay.addEventListener('click', () => this.options.onReplayRepresentative(representative));
      card.append(replay);
      cards.append(card);
    }
    if (result.representatives.length === 0) cards.append(element('p', 'combat-lab-batch-results__empty', 'Характерные прогоны не выбраны.'));
    representatives.append(cards);

    this.root.replaceChildren(heading, summary, failureSection, distributionHost, representatives);
  }

  destroy(): void {
    this.clearDistributions();
    this.root.remove();
  }

  private clearDistributions(): void {
    for (const distribution of this.distributions) distribution.destroy();
    this.distributions.length = 0;
  }
}

function appendMetricCard(host: HTMLElement, result: CombatLabBatchResultV1, metricId: string, label: string): void {
  const metric = result.metrics[metricId];
  if (metric) host.append(summaryCard(label, formatNumber(metric.mean)));
}

function summaryCard(label: string, value: string): HTMLElement {
  const card = element('div', 'combat-lab-batch-summary-card');
  card.append(element('span', '', label), element('strong', '', value));
  return card;
}

function representativeTitle(result: CombatLabBatchResultV1, representative: CombatLabRepresentativeRunV1): string {
  if (!representative.success) return `Первая неудача: ${representative.stopReason}`;
  const successful = result.representatives.filter((candidate) => candidate.success);
  const fastest = successful.reduce<CombatLabRepresentativeRunV1 | null>((best, candidate) => (
    !best || candidate.simulatedSeconds < best.simulatedSeconds || (candidate.simulatedSeconds === best.simulatedSeconds && candidate.runIndex < best.runIndex)
      ? candidate
      : best
  ), null);
  const slowest = successful.reduce<CombatLabRepresentativeRunV1 | null>((best, candidate) => (
    !best || candidate.simulatedSeconds > best.simulatedSeconds || (candidate.simulatedSeconds === best.simulatedSeconds && candidate.runIndex < best.runIndex)
      ? candidate
      : best
  ), null);
  if (representative.runIndex === fastest?.runIndex) return 'Самый быстрый успешный прогон';
  if (representative.runIndex === slowest?.runIndex) return 'Самый долгий успешный прогон';
  return 'Характерный успешный прогон';
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}
function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}
function formatPercent(value: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}
function formatSeconds(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)} с`;
}
