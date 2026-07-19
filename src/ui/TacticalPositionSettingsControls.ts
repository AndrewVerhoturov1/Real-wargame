import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import {
  cloneTacticalPositionSettings,
  createDefaultTacticalPositionSettings,
  getTacticalPositionSettings,
  getTacticalPositionSettingsDraft,
  getTacticalPositionSettingsRevision,
  replaceTacticalPositionSettingsDraft,
  setTacticalPositionSettings,
  type TacticalPositionSettings,
} from '../core/tactical/TacticalPositionSettings';
import { getTacticalPositionSearchService } from '../core/tactical/TacticalPositionSearchService';

export function installTacticalPositionSettingsControls(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  let scheduled = false;

  const render = (force = false): void => {
    scheduled = false;
    const activeTab = document.querySelector<HTMLButtonElement>('.game-editor-tabs button.active');
    const body = document.querySelector<HTMLElement>('.game-editor-body');
    if (!body || activeTab?.textContent?.trim() !== 'Боец') return;
    const existing = body.querySelector<HTMLElement>('[data-tactical-position-settings-controls]');
    if (existing && !force) return;
    existing?.remove();

    const draft = getTacticalPositionSettingsDraft(state);
    const root = document.createElement('details');
    root.className = 'game-editor-details attention-profile-controls tactical-position-settings-controls';
    root.dataset.tacticalPositionSettingsControls = 'true';
    root.open = true;

    const summary = document.createElement('summary');
    summary.textContent = 'Тактические позиции';
    const content = document.createElement('div');
    content.className = 'game-editor-details-body attention-profile-body';
    content.append(
      hint('Настройки определяют, какие позиции считаются полезными, какую позу боец выбирает и насколько часто обновляются ромбы. Поиск остаётся ограниченным и использует готовые поля.'),
      group('Выбор позы'),
      grid([
        numberField('Стоя: максимальная опасность', draft.standingMaximumDanger, 0, 100, 1, (value) => draft.standingMaximumDanger = value),
        numberField('Стоя: минимальная безопасность', draft.standingMinimumSafety, 0, 100, 1, (value) => draft.standingMinimumSafety = value),
        numberField('Пригнувшись: максимальная опасность', draft.crouchedMaximumDanger, 0, 100, 1, (value) => draft.crouchedMaximumDanger = value),
        numberField('Пригнувшись: минимальная безопасность', draft.crouchedMinimumSafety, 0, 100, 1, (value) => draft.crouchedMinimumSafety = value),
        numberField('Штраф перехода в положение сидя', draft.crouchedTransitionPenalty, 0, 50, 0.5, (value) => draft.crouchedTransitionPenalty = value),
        numberField('Штраф перехода лёжа', draft.proneTransitionPenalty, 0, 50, 0.5, (value) => draft.proneTransitionPenalty = value),
        numberField('Влияние защиты позы', draft.postureProtectionGainFactor, 0, 2, 0.05, (value) => draft.postureProtectionGainFactor = value),
        numberField('Опасность → безопасность', draft.dangerReductionSafetyWeight, 0, 2, 0.05, (value) => draft.dangerReductionSafetyWeight = value),
        numberField('Защита → безопасность', draft.protectionGainSafetyWeight, 0, 2, 0.05, (value) => draft.protectionGainSafetyWeight = value),
        checkboxField('К опасной позиции двигаться пригнувшись', draft.moveCrouchedToProtectedPosition, (value) => draft.moveCrouchedToProtectedPosition = value),
      ], onChanged),
      group('Отбор позиции'),
      grid([
        numberField('Минимальное улучшение', draft.minimumPositionImprovement, 0, 100, 1, (value) => draft.minimumPositionImprovement = value),
        numberField('Минимальная защита от угрозы', draft.minimumDirectionalProtection, 0, 100, 1, (value) => draft.minimumDirectionalProtection = value),
        numberField('Минимум обратного склона', draft.minimumReverseSlopeQuality, 0, 100, 1, (value) => draft.minimumReverseSlopeQuality = value),
      ], onChanged),
      group('Коэффициенты итоговой оценки'),
      grid([
        numberField('Безопасность', draft.safetyWeight, 0, 2, 0.01, (value) => draft.safetyWeight = value),
        numberField('Низкая опасность', draft.lowDangerWeight, 0, 2, 0.01, (value) => draft.lowDangerWeight = value),
        numberField('Защита', draft.protectionWeight, 0, 2, 0.01, (value) => draft.protectionWeight = value),
        numberField('Скрытность', draft.concealmentWeight, 0, 2, 0.01, (value) => draft.concealmentWeight = value),
        numberField('Улучшение относительно текущего места', draft.safetyGainWeight, 0, 2, 0.01, (value) => draft.safetyGainWeight = value),
        numberField('Обратный склон', draft.reverseSlopeWeight, 0, 2, 0.01, (value) => draft.reverseSlopeWeight = value),
        numberField('Безопасность маршрута', draft.routeSafetyWeight, 0, 2, 0.01, (value) => draft.routeSafetyWeight = value),
        numberField('Направление приказа', draft.orderAlignmentWeight, 0, 2, 0.01, (value) => draft.orderAlignmentWeight = value),
        numberField('Штраф неопределённости', draft.uncertaintyPenaltyWeight, 0, 2, 0.01, (value) => draft.uncertaintyPenaltyWeight = value),
        numberField('Штраф переднего склона', draft.forwardSlopePenaltyWeight, 0, 2, 0.01, (value) => draft.forwardSlopePenaltyWeight = value),
      ], onChanged),
      group('Стабильность ромбов'),
      grid([
        numberField('Обновлять не чаще, секунд', draft.markerRefreshIntervalSeconds, 0, 10, 0.1, (value) => draft.markerRefreshIntervalSeconds = value),
        numberField('Удерживать старые при пустом результате, секунд', draft.emptyResultHoldSeconds, 0, 15, 0.1, (value) => draft.emptyResultHoldSeconds = value),
      ], onChanged),
      buttonRow([
        actionButton('Взять настройки выбранного', () => {
          const selected = getSelectedUnit(state);
          if (!selected) return;
          replaceTacticalPositionSettingsDraft(state, cloneTacticalPositionSettings(getTacticalPositionSettings(selected)));
          render(true);
        }),
        actionButton('Применить к выбранному', () => {
          const selected = getSelectedUnit(state);
          if (!selected) return;
          setTacticalPositionSettings(selected, getTacticalPositionSettingsDraft(state));
          getTacticalPositionSearchService(state)?.clearUnit(selected.id);
          state.editor.lastMessage = `Настройки тактических позиций применены к бойцу: ${selected.id}`;
          onChanged();
          render(true);
        }, 'primary'),
        actionButton('Сбросить настройки', () => {
          replaceTacticalPositionSettingsDraft(state, createDefaultTacticalPositionSettings());
          onChanged();
          render(true);
        }, 'danger'),
      ]),
      selectedSummary(state),
    );
    root.append(summary, content);
    body.append(root);
  };

  const scheduleRender = (): void => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => render(false));
  };
  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  scheduleRender();
  return () => observer.disconnect();
}

function grid(fields: HTMLElement[], onChanged: () => void): HTMLElement {
  const element = document.createElement('div');
  element.className = 'attention-profile-grid';
  for (const field of fields) {
    field.addEventListener('change', onChanged);
    element.append(field);
  }
  return element;
}

function numberField(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = formatStepNumber(value, step);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', () => {
    const parsed = Number(input.value);
    const next = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : value));
    input.value = formatStepNumber(next, step);
    onChange(next);
  });
  return wrapField(label, input);
}

function checkboxField(label: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  const wrapper = wrapField(label, input);
  wrapper.classList.add('checkbox');
  return wrapper;
}

function wrapField(label: string, input: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'game-editor-field attention-profile-field';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, input);
  return wrapper;
}

function group(text: string): HTMLElement {
  const title = document.createElement('div');
  title.className = 'game-editor-group-title';
  title.textContent = text;
  return title;
}

function hint(text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = 'attention-profile-hint';
  element.textContent = text;
  return element;
}

function actionButton(text: string, onClick: () => void, tone?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  if (tone) button.classList.add(tone);
  button.addEventListener('click', onClick);
  return button;
}

function buttonRow(buttons: HTMLButtonElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'game-editor-button-row';
  row.append(...buttons);
  return row;
}

function selectedSummary(state: SimulationState): HTMLElement {
  const selected = getSelectedUnit(state);
  const block = document.createElement('div');
  block.className = 'game-editor-selected-summary';
  block.innerHTML = `<span>Выбранный боец</span><strong>${escapeHtml(selected ? `${selected.labels.ru} · ${selected.id} · revision ${getTacticalPositionSettingsRevision(selected)}` : 'не выбран')}</strong>`;
  return block;
}

function formatStepNumber(value: number, step: number): string {
  const decimalPart = String(step).split('.')[1] ?? '';
  const precision = Math.min(4, decimalPart.length);
  return Number(value.toFixed(precision)).toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] ?? character));
}
