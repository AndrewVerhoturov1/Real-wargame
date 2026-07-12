import { getBestPerceptionContact } from '../core/perception/PerceptionSystem';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import {
  getAttentionOverlayState,
  setAttentionCurrentContacts,
  setAttentionCurrentView,
  setAttentionMemoryMarkers,
  setAttentionOverlayActive,
  setAttentionUncertainty,
  setSelectedAttentionContact,
} from '../core/ui/RuntimeUiState';
import { getVisibilityFieldDiagnostics } from '../core/visibility/SelectedUnitVisibilityField';

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
  const memoryTab = nav?.querySelector<HTMLButtonElement>('[data-tab="memory"]') ?? null;
  if (!sidebar || !sidebarBody || !nav || !display || !memoryTab) return () => undefined;

  const originalTabText = memoryTab.textContent ?? 'Память';
  memoryTab.dataset.attentionTab = 'true';
  memoryTab.textContent = 'Обзор и память';

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
    memoryTab.classList.toggle('active', active);
    setAttentionOverlayActive(state, active);
    syncDisplayToggle();
    render();
    onChanged();
  };

  const onMemoryTabClick = () => setPanelOpen(true);
  memoryTab.addEventListener('click', onMemoryTabClick);
  const otherTabs = [...nav.querySelectorAll<HTMLButtonElement>('[data-tab]')]
    .filter((button) => button !== memoryTab);
  const closePanel = () => {
    if (panelOpen) setPanelOpen(false);
  };
  for (const normalTab of otherTabs) normalTab.addEventListener('click', closePanel);

  displayToggle.addEventListener('click', () => {
    const overlay = getAttentionOverlayState(state);
    setAttentionOverlayActive(state, !overlay.active);
    syncDisplayToggle();
    onChanged();
  });

  function syncDisplayToggle(): void {
    const active = getAttentionOverlayState(state).active;
    displayToggle.textContent = `Обзор и память: ${active ? 'вкл' : 'выкл'}`;
    displayToggle.classList.toggle('active', active);
  }

  function render(): void {
    if (!panelOpen) return;
    const unit = getSelectedUnit(state);
    if (!unit) {
      panel.innerHTML = '<header><strong>Обзор и память</strong><span>Выберите бойца на карте.</span></header>';
      return;
    }

    const overlay = getAttentionOverlayState(state);
    const best = getBestPerceptionContact(unit);
    const fieldDiagnostics = getVisibilityFieldDiagnostics(state);
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
        <div><strong>Обзор и память</strong><span>Текущая видимость и субъективные знания выбранного бойца</span></div>
        <button type="button" data-close-attention title="Выключить слой и вернуться к списку старых знаний">×</button>
      </header>
      <div class="attention-compact-legend" aria-label="Легенда обзора и памяти">
        <div class="attention-legend-row"><span>Обзор</span><i class="attention-legend-gradient"></i><small>Хорошо видно · Средне · Слабо · Не видно</small></div>
        <div class="attention-legend-row attention-legend-markers"><span>Память</span><b class="attention-legend-marker current"></b><small>Текущий контакт</small><b class="attention-legend-marker memory"></b><small>Последнее место</small><b class="attention-legend-marker suspicion"></b><small>Подозрение</small><b class="attention-legend-marker sound"></b><small>Звук</small></div>
      </div>
      <div class="attention-runtime-grid">
        ${metric('Режим внимания', MODE_LABELS[unit.attentionRuntime.mode])}
        ${metric('Источник режима', modeSourceLabel(unit.attentionRuntime.modeSource))}
        ${metric('Максимальная дальность', `${Math.round(unit.attentionSettings.vision.maximumVisualRangeMeters)} м`)}
        ${metric('Падение качества с', `${Math.round(unit.attentionSettings.vision.distanceFalloffStartMeters)} м`)}
        ${metric('Лучший контакт', best ? STAGE_LABELS[best.stage] : 'нет')}
        ${metric('Уверенность', best ? `${Math.round(best.confidence)}%` : '—')}
        ${metric('Неточность', best ? `±${Math.round(best.uncertaintyCells * state.map.metersPerCell)} м` : '—')}
        ${metric('Накопление', best ? `${best.evidencePerSecond.toFixed(1)}/с` : '—')}
        ${metric('Перестроения карты', String(fieldDiagnostics.rebuildCount))}
        ${metric('Полей в кеше', String(fieldDiagnostics.cachedFieldCount))}
        ${metric('Повторных использований с запуска', String(fieldDiagnostics.cacheHitCount))}
        ${metric('Причина обновления', fieldDiagnostics.lastBuildReason)}
        ${metric('Обработано шагов', String(fieldDiagnostics.processedCellCount))}
      </div>
      <div class="attention-runtime-toggles">
        ${checkbox('Текущий обзор', 'current-view', overlay.showCurrentView)}
        ${checkbox('Метки памяти', 'memory-markers', overlay.showMemoryMarkers)}
        ${checkbox('Текущие контакты', 'current-contacts', overlay.showCurrentContacts)}
        ${checkbox('Области неопределённости', 'uncertainty', overlay.showUncertainty)}
      </div>
      <section class="attention-explanation"><h3>Почему замечает или не замечает</h3><ul>${explanation}</ul></section>
      <section class="attention-contact-list"><h3>Контакты в памяти</h3>${contacts}</section>`;

    panel.querySelector<HTMLButtonElement>('[data-close-attention]')?.addEventListener('click', () => setPanelOpen(false));
    bindCheckbox(panel, 'current-view', (active) => setAttentionCurrentView(state, active), onChanged);
    bindCheckbox(panel, 'memory-markers', (active) => setAttentionMemoryMarkers(state, active), onChanged);
    bindCheckbox(panel, 'current-contacts', (active) => setAttentionCurrentContacts(state, active), onChanged);
    bindCheckbox(panel, 'uncertainty', (active) => setAttentionUncertainty(state, active), onChanged);
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
    memoryTab.removeEventListener('click', onMemoryTabClick);
    for (const normalTab of otherTabs) normalTab.removeEventListener('click', closePanel);
    delete memoryTab.dataset.attentionTab;
    memoryTab.textContent = originalTabText;
    displayToggle.remove();
    panel.remove();
    sidebarBody.hidden = false;
  };
}

function metric(label: string, value: string): string {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function checkbox(label: string, key: string, checked: boolean): string {
  return `<label class="attention-runtime-checkbox"><input type="checkbox" data-view-memory-toggle="${key}" ${checked ? 'checked' : ''}>${label}</label>`;
}

function bindCheckbox(
  panel: HTMLElement,
  key: string,
  setter: (active: boolean) => void,
  onChanged: () => void,
): void {
  panel.querySelector<HTMLInputElement>(`[data-view-memory-toggle="${key}"]`)?.addEventListener('change', (event) => {
    setter((event.currentTarget as HTMLInputElement).checked);
    onChanged();
  });
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] ?? character));
}
