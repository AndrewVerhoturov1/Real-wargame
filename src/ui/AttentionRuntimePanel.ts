import { radiansToDegrees } from '../core/perception/AttentionModel';
import { getBestPerceptionContact } from '../core/perception/PerceptionSystem';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import {
  getAttentionOverlayState,
  setAttentionOverlayActive,
  setAttentionVisibilityFan,
  setSelectedAttentionContact,
} from '../core/ui/RuntimeUiState';

const MODE_LABELS = {
  march: 'Марш',
  observe: 'Наблюдение',
  search: 'Поиск цели',
  engage: 'Стрельба',
} as const;

const STAGE_LABELS = {
  cue: 'признак',
  suspicion: 'подозрение',
  contact: 'контакт',
  identified: 'опознано',
  confirmed: 'подтверждено',
} as const;

export function installAttentionRuntimePanel(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const sidebar = document.querySelector<HTMLElement>('.simulation-sidebar');
  const sidebarBody = document.querySelector<HTMLElement>('.simulation-sidebar-body');
  const nav = document.querySelector<HTMLElement>('.simulation-tabs');
  const display = document.querySelector<HTMLElement>('[data-role="display"]');
  if (!sidebar || !sidebarBody || !nav || !display) return () => undefined;

  const tabButton = document.createElement('button');
  tabButton.type = 'button';
  tabButton.dataset.attentionTab = 'true';
  tabButton.textContent = 'Внимание';
  nav.append(tabButton);

  const panel = document.createElement('section');
  panel.className = 'attention-runtime-panel';
  panel.hidden = true;
  sidebar.append(panel);

  const displayToggle = document.createElement('button');
  displayToggle.type = 'button';
  display.append(displayToggle);

  let panelOpen = false;
  const setPanelOpen = (active: boolean) => {
    panelOpen = active;
    panel.hidden = !active;
    sidebarBody.hidden = active;
    tabButton.classList.toggle('active', active);
    if (active) setAttentionOverlayActive(state, true);
    syncDisplayToggle();
    render();
    onChanged();
  };

  tabButton.addEventListener('click', () => setPanelOpen(!panelOpen));
  for (const normalTab of nav.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    normalTab.addEventListener('click', () => setPanelOpen(false));
  }

  displayToggle.addEventListener('click', () => {
    const overlay = getAttentionOverlayState(state);
    setAttentionOverlayActive(state, !overlay.active);
    syncDisplayToggle();
    onChanged();
  });

  function syncDisplayToggle(): void {
    const active = getAttentionOverlayState(state).active;
    displayToggle.textContent = `Обзор и внимание: ${active ? 'вкл' : 'выкл'}`;
    displayToggle.classList.toggle('active', active);
  }

  function render(): void {
    if (!panelOpen) return;
    const unit = getSelectedUnit(state);
    if (!unit) {
      panel.innerHTML = '<header><strong>Обзор и внимание</strong><span>Выберите бойца на карте.</span></header>';
      return;
    }

    const overlay = getAttentionOverlayState(state);
    const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
    const best = getBestPerceptionContact(unit);
    const explanation = best?.explanationRu.length
      ? best.explanationRu.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
      : '<li>Боец пока не накопил достаточно признаков.</li>';
    const contacts = unit.perceptionKnowledge.contacts.length
      ? unit.perceptionKnowledge.contacts.map((contact) => `
        <button type="button" class="attention-contact-card ${contact.id === overlay.selectedContactId ? 'selected' : ''}" data-contact-id="${escapeHtml(contact.id)}">
          <strong>${escapeHtml(contact.labelRu)}</strong>
          <span>${STAGE_LABELS[contact.stage]} · уверенность ${Math.round(contact.confidence)}%</span>
          <em>неточность ±${Math.round(contact.uncertaintyCells * state.map.metersPerCell)} м · ${sourceLabel(contact.source)}</em>
        </button>`).join('')
      : '<p class="attention-empty">Контактов пока нет.</p>';

    panel.innerHTML = `
      <header class="attention-runtime-header">
        <div><strong>Обзор и внимание</strong><span>Субъективное восприятие выбранного бойца</span></div>
        <button type="button" data-close-attention>×</button>
      </header>
      <div class="attention-runtime-grid">
        ${metric('Режим внимания', MODE_LABELS[unit.attentionRuntime.mode])}
        ${metric('Источник режима', modeSourceLabel(unit.attentionRuntime.modeSource))}
        ${metric('Направление фокуса', `${normalizeDegrees(radiansToDegrees(unit.attentionRuntime.focusDirectionRadians))}°`)}
        ${metric('Угол фокуса', `${Math.round(profile.focusAngleDegrees)}°`)}
        ${metric('Прямое внимание', `${Math.round(profile.directAngleDegrees)}°`)}
        ${metric('Косвенное внимание', `${Math.round(profile.peripheralWeight * 100)}%`)}
        ${metric('Ход сканирования', `${Math.round(unit.attentionRuntime.scanProgress01 * 100)}%`)}
        ${metric('Лучший контакт', best ? STAGE_LABELS[best.stage] : 'нет')}
        ${metric('Уверенность', best ? `${Math.round(best.confidence)}%` : '—')}
        ${metric('Неточность', best ? `±${Math.round(best.uncertaintyCells * state.map.metersPerCell)} м` : '—')}
        ${metric('Накопление', best ? `${best.evidencePerSecond.toFixed(1)}/с` : '—')}
      </div>
      <label class="attention-runtime-checkbox"><input type="checkbox" data-visibility-fan ${overlay.showVisibilityFan ? 'checked' : ''}>Показывать проверочные лучи сектора</label>
      <section class="attention-explanation"><h3>Почему замечает или не замечает</h3><ul>${explanation}</ul></section>
      <section class="attention-contact-list"><h3>Контакты в памяти</h3>${contacts}</section>`;

    panel.querySelector<HTMLButtonElement>('[data-close-attention]')?.addEventListener('click', () => setPanelOpen(false));
    panel.querySelector<HTMLInputElement>('[data-visibility-fan]')?.addEventListener('change', (event) => {
      setAttentionVisibilityFan(state, (event.currentTarget as HTMLInputElement).checked);
      onChanged();
    });
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-contact-id]')) {
      button.addEventListener('click', () => {
        const next = button.dataset.contactId ?? null;
        setSelectedAttentionContact(state, overlay.selectedContactId === next ? null : next);
        render();
        onChanged();
      });
    }
  }

  syncDisplayToggle();
  const interval = window.setInterval(render, 250);
  return () => {
    window.clearInterval(interval);
    tabButton.remove();
    displayToggle.remove();
    panel.remove();
    sidebarBody.hidden = false;
  };
}

function metric(label: string, value: string): string {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function modeSourceLabel(source: 'automatic' | 'ai' | 'player'): string {
  if (source === 'ai') return 'граф ИИ';
  if (source === 'player') return 'игрок';
  return 'автоматически';
}

function sourceLabel(source: 'visual' | 'sound' | 'reported' | 'fire_pressure'): string {
  if (source === 'sound') return 'по звуку';
  if (source === 'reported') return 'по докладу';
  if (source === 'fire_pressure') return 'по обстрелу';
  return 'зрительно';
}

function normalizeDegrees(value: number): number {
  const normalized = Math.round(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] ?? character));
}
