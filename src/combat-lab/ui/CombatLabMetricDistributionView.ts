import type { CombatLabDistributionSummaryV1 } from '../../core/testing/combat-lab/CombatLabBatchContracts';

const SVG_WIDTH = 320;
const SVG_HEIGHT = 72;
const MAX_BUCKETS = 40;

export class CombatLabMetricDistributionView {
  readonly element = document.createElement('section');
  private readonly title = document.createElement('h4');
  private readonly summary = document.createElement('div');
  private readonly chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  constructor() {
    this.element.className = 'combat-lab-batch-distribution';
    this.summary.className = 'combat-lab-batch-distribution__summary';
    this.chart.classList.add('combat-lab-batch-distribution__chart');
    this.chart.setAttribute('viewBox', `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`);
    this.chart.setAttribute('role', 'img');
    this.element.append(this.title, this.summary, this.chart);
  }

  render(labelRu: string, distribution: CombatLabDistributionSummaryV1): void {
    this.title.textContent = labelRu;
    this.summary.textContent = `Среднее ${formatNumber(distribution.mean)} · медиана ${formatNumber(distribution.median)} · p05 ${formatNumber(distribution.p05)} · p95 ${formatNumber(distribution.p95)}`;
    this.chart.setAttribute('aria-label', `${labelRu}: распределение по ${distribution.count} прогонам`);
    const buckets = distribution.histogram.slice(0, MAX_BUCKETS);
    const maximumCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
    const width = SVG_WIDTH / Math.max(1, buckets.length);
    const bars = buckets.map((bucket, index) => {
      const height = Math.max(1, (bucket.count / maximumCount) * (SVG_HEIGHT - 14));
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(index * width + 1));
      rect.setAttribute('y', String(SVG_HEIGHT - height));
      rect.setAttribute('width', String(Math.max(1, width - 2)));
      rect.setAttribute('height', String(height));
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${formatNumber(bucket.minimum)}–${formatNumber(bucket.maximum)}: ${bucket.count}`;
      rect.append(title);
      return rect;
    });
    this.chart.replaceChildren(...bars);
  }

  destroy(): void {
    this.element.remove();
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}
