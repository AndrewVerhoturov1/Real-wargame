import type { AiBlackboardValue } from '../core/ai/AiBlackboard';
import {
  MOVEMENT_PROFILE_MEMORY_KEYS,
  movementProfileLabelRu,
  movementProfileSourceLabelRu,
  normalizeMovementProfileSource,
} from '../core/movement/MovementProfiles';
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
    const memory = unit ? readMovementMemory(unit.behaviorRuntime) : {};
    const activeMovementProfileId = readText(
      memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId],
      command?.intent.movementProfileId ?? unit?.unitRoleMovementProfileId ?? 'normal',
    );
    const activeMovementProfileSource = normalizeMovementProfileSource(
      memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource],
      command ? 'player_order' : unit?.unitRoleMovementProfileId ? 'unit_role' : 'default',
    );
    const key = command
      ? [
          unit?.id,
          command.id,
          command.revision,
          unit?.order?.routeStatus ?? 'none',
          unit?.activeNavigationProfileId ?? '',
          activeMovementProfileId,
          activeMovementProfileSource,
          memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeGait] ?? '',
          memory[MOVEMENT_PROFILE_MEMORY_KEYS.speed] ?? '',
          memory[MOVEMENT_PROFILE_MEMORY_KEYS.stamina] ?? '',
          memory[MOVEMENT_PROFILE_MEMORY_KEYS.noise] ?? '',
          memory[MOVEMENT_PROFILE_MEMORY_KEYS.visualSignature] ?? '',
          memory[MOVEMENT_PROFILE_MEMORY_KEYS.canFire] ?? '',
          memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback] ?? '',
          memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedReason] ?? '',
        ].join('|')
      : `${unit?.id ?? 'none'}|none`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;

    if (!unit || !command) {
      this.root.hidden = true;
      this.root.replaceChildren();
      return;
    }

    const preset = getTacticalOrderPresetDefinition(command.intent.presetId);
    const aiOverride = activeMovementProfileSource === 'ai_override'
      ? movementProfileLabelRu(activeMovementProfileId)
      : 'отсутствует';
    const forcedReason = readText(memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedReason], 'нет');
    this.root.hidden = false;
    this.root.innerHTML = `
      <strong>Приказ: ${escapeHtml(preset.nameRu)}</strong>
      <p>${escapeHtml(preset.shortDescriptionRu)}</p>
      ${row('Цель', `${command.target.x.toFixed(1)}, ${command.target.y.toFixed(1)}`)}
      ${row('Маршрут', navigationProfileLabelRu(command.intent.navigationProfileId))}
      ${row('Приказанный профиль', movementProfileLabelRu(command.intent.movementProfileId))}
      ${row('AI-переопределение', aiOverride)}
      ${row('Активный профиль', movementProfileLabelRu(activeMovementProfileId))}
      ${row('Фактическое движение', readText(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeGait], 'не опубликовано'))}
      ${row('Источник', movementProfileSourceLabelRu(activeMovementProfileSource))}
      ${row('Скорость', formatMetric(memory[MOVEMENT_PROFILE_MEMORY_KEYS.speed]))}
      ${row('Выносливость', formatMetric(memory[MOVEMENT_PROFILE_MEMORY_KEYS.stamina]))}
      ${row('Шум', formatMetric(memory[MOVEMENT_PROFILE_MEMORY_KEYS.noise]))}
      ${row('Заметность', formatMetric(memory[MOVEMENT_PROFILE_MEMORY_KEYS.visualSignature]))}
      ${row('Оружие готово', formatBoolean(memory[MOVEMENT_PROFILE_MEMORY_KEYS.canFire]))}
      ${row('Причина ограничения', forcedReason)}
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

function readMovementMemory(runtime: unknown): Record<string, AiBlackboardValue> {
  if (!isRecord(runtime)) return {};
  const session = isRecord(runtime.aiRuntimeSession) ? runtime.aiRuntimeSession : null;
  if (session && isRecord(session.blackboardMemory)) return session.blackboardMemory as Record<string, AiBlackboardValue>;
  return isRecord(runtime.aiGraphMemory) ? runtime.aiGraphMemory as Record<string, AiBlackboardValue> : {};
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

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function formatMetric(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value * 100) / 100) : 'не опубликовано';
}

function formatBoolean(value: unknown): string {
  return typeof value === 'boolean' ? value ? 'да' : 'нет' : 'не опубликовано';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
