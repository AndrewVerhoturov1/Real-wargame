import type { SimulationState } from '../core/simulation/SimulationState';
import { getSelectedUnit } from '../core/simulation/SimulationState';
import {
  getTacticalOrderPresetDefinition,
  tacticalOrderAttentionLabelRu,
  tacticalOrderContactLabelRu,
  tacticalOrderFireLabelRu,
} from '../core/orders/TacticalOrderIntent';

export class TacticalOrderStatusCard {
  private readonly root = document.createElement('section');
  private lastKey = '';

  constructor(private readonly state: SimulationState) {
    this.root.className = 'tactical-order-card';
    this.root.dataset.role = 'tactical-order-status';
    this.root.setAttribute('aria-live', 'polite');
    this.root.hidden = true;
    document.body.append(this.root);
    this.update(true);
  }

  update(force = false): void {
    const unit = getSelectedUnit(this.state);
    const command = unit?.playerCommand ?? null;
    const key = command
      ? `${unit?.id}|${command.id}|${command.revision}|${unit?.order?.routeStatus ?? 'none'}|${unit?.activeNavigationProfileId ?? ''}`
      : `${unit?.id ?? 'none'}|none`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;

    if (!unit || !command) {
      this.root.hidden = true;
      this.root.replaceChildren();
      return;
    }

    const preset = getTacticalOrderPresetDefinition(command.intent.presetId);
    this.root.hidden = false;
    this.root.innerHTML = `
      <strong>Приказ: ${escapeHtml(preset.nameRu)}</strong>
      <p>${escapeHtml(preset.shortDescriptionRu)}</p>
      ${row('Цель', `${command.target.x.toFixed(1)}, ${command.target.y.toFixed(1)}`)}
      ${row('Маршрут', navigationProfileLabelRu(command.intent.navigationProfileId))}
      ${row('Внимание', tacticalOrderAttentionLabelRu(command.intent.attentionPolicy))}
      ${row('При контакте', tacticalOrderContactLabelRu(command.intent.contactPolicy))}
      ${row('Огонь', tacticalOrderFireLabelRu(command.intent.firePolicy))}
      ${row('Статус', commandStatusLabelRu(command.status, Boolean(unit.order)))}
    `;
  }

  destroy(): void {
    this.root.remove();
  }
}

function row(label: string, value: string): string {
  return `<span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b>`;
}

function commandStatusLabelRu(status: string, hasOrder: boolean): string {
  if (status === 'blocked') return 'маршрут недоступен';
  if (status === 'completed') return 'выполнен';
  if (status === 'cancelled') return 'отменён';
  return hasOrder ? 'выполняется' : 'ожидает продолжения';
}

function navigationProfileLabelRu(profileId: string): string {
  const labels: Record<string, string> = {
    normal: 'Обычный',
    fast: 'Быстрый',
    stealth: 'Скрытный',
    attack: 'Атакующий',
    cautious: 'Осторожный',
    retreat: 'Отход',
    direct: 'Прямой',
  };
  return labels[profileId] ?? profileId;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
