import { getGameEditorDrafts, cloneAttentionSettings, resetUnitAttentionDraft } from '../core/editor/GameEditorDrafts';
import {
  ATTENTION_MODES,
  createAttentionRuntime,
  type AttentionMode,
  type AttentionModeProfile,
} from '../core/perception/AttentionModel';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';

const MODE_LABELS: Record<AttentionMode, string> = {
  march: 'Марш',
  observe: 'Наблюдение',
  search: 'Поиск цели',
  engage: 'Стрельба',
};

export function installAttentionProfileControls(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  let activeMode: AttentionMode = 'march';
  let scheduled = false;

  const render = () => {
    scheduled = false;
    const activeTab = document.querySelector<HTMLButtonElement>('.game-editor-tabs button.active');
    const body = document.querySelector<HTMLElement>('.game-editor-body');
    if (!body || activeTab?.textContent?.trim() !== 'Боец') return;
    body.querySelector('[data-attention-profile-controls]')?.remove();

    const draft = getGameEditorDrafts(state).unit;
    const profile = draft.attention.profiles[activeMode];
    const root = document.createElement('details');
    root.className = 'game-editor-details attention-profile-controls';
    root.dataset.attentionProfileControls = 'true';
    root.open = true;

    const summary = document.createElement('summary');
    summary.textContent = 'Обзор и внимание';
    const content = document.createElement('div');
    content.className = 'game-editor-details-body attention-profile-body';
    content.append(
      hint('Режимы задают постоянные настройки. Ноды ИИ только выбирают режим или сектор поиска.'),
      selectField('Режим по умолчанию', ATTENTION_MODES.map((mode) => [mode, MODE_LABELS[mode]]), draft.attention.defaultMode, (mode) => {
        draft.attention.defaultMode = mode;
      }),
      selectField('Редактируемый режим', ATTENTION_MODES.map((mode) => [mode, MODE_LABELS[mode]]), activeMode, (mode) => {
        activeMode = mode;
        render();
      }),
      profileGrid(profile, activeMode, () => {
        if (activeMode === 'observe') draft.viewAngleDegrees = profile.directAngleDegrees;
        onChanged();
      }),
      buttonRow([
        actionButton('Взять внимание выбранного', () => {
          const selected = getSelectedUnit(state);
          if (!selected) return;
          draft.attention = cloneAttentionSettings(selected.attentionSettings);
          draft.viewAngleDegrees = draft.attention.profiles.observe.directAngleDegrees;
          render();
        }),
        actionButton('Применить к выбранному', () => {
          const selected = getSelectedUnit(state);
          if (!selected) return;
          selected.attentionSettings = cloneAttentionSettings(draft.attention);
          selected.attentionRuntime = createAttentionRuntime(selected.attentionSettings, selected.facingRadians);
          selected.viewAngleRadians = degreesToRadians(selected.attentionSettings.profiles.observe.directAngleDegrees);
          state.editor.lastMessage = `Профили внимания применены к бойцу: ${selected.id}`;
          onChanged();
          render();
        }, 'primary'),
        actionButton('Сбросить профили', () => {
          resetUnitAttentionDraft(draft);
          activeMode = 'march';
          onChanged();
          render();
        }, 'danger'),
      ]),
      selectedSummary(state),
    );
    root.append(summary, content);
    body.append(root);
  };

  const scheduleRender = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(render);
  };
  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  scheduleRender();
  return () => observer.disconnect();
}

function profileGrid(
  profile: AttentionModeProfile,
  mode: AttentionMode,
  onChanged: () => void,
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'attention-profile-grid';
  grid.append(
    numberField('Угол фокуса, °', profile.focusAngleDegrees, 1, 180, 1, (value) => {
      profile.focusAngleDegrees = Math.min(value, profile.directAngleDegrees);
      onChanged();
    }),
    numberField('Прямое внимание, °', profile.directAngleDegrees, 1, 360, 1, (value) => {
      profile.directAngleDegrees = Math.max(value, profile.focusAngleDegrees);
      onChanged();
    }),
    numberField('Сила фокуса, %', profile.focusWeight * 100, 0, 200, 1, (value) => {
      profile.focusWeight = value / 100;
      onChanged();
    }),
    numberField('Сила прямого внимания, %', profile.directWeight * 100, 0, 200, 1, (value) => {
      profile.directWeight = value / 100;
      onChanged();
    }),
    numberField('Косвенное внимание, %', profile.peripheralWeight * 100, 0, 100, 1, (value) => {
      profile.peripheralWeight = value / 100;
      onChanged();
    }),
    numberField('Скорость осмотра, °/с', profile.scanSpeedDegreesPerSecond, 0, 360, 1, (value) => {
      profile.scanSpeedDegreesPerSecond = value;
      onChanged();
    }),
    numberField('Проверка фокуса, с', profile.focusCheckIntervalSeconds, 0.05, 5, 0.05, (value) => {
      profile.focusCheckIntervalSeconds = value;
      onChanged();
    }),
    numberField('Проверка прямого сектора, с', profile.directCheckIntervalSeconds, 0.05, 5, 0.05, (value) => {
      profile.directCheckIntervalSeconds = value;
      onChanged();
    }),
    numberField('Проверка периферии, с', profile.peripheralCheckIntervalSeconds, 0.05, 10, 0.05, (value) => {
      profile.peripheralCheckIntervalSeconds = value;
      onChanged();
    }),
    numberField('Проверка тыла, с', profile.rearCheckIntervalSeconds, 0.25, 60, 0.25, (value) => {
      profile.rearCheckIntervalSeconds = value;
      onChanged();
    }),
    numberField('Стандартный сектор поиска, °', profile.defaultSearchArcDegrees, 1, 360, 1, (value) => {
      profile.defaultSearchArcDegrees = value;
      onChanged();
    }),
  );
  const note = document.createElement('p');
  note.className = 'attention-profile-note';
  note.textContent = mode === 'march'
    ? 'На марше косвенное внимание действует по кругу, но хуже распознаёт неподвижные цели.'
    : mode === 'engage'
      ? 'При стрельбе фокус удерживается на цели, а фланги контролируются значительно хуже.'
      : mode === 'search'
        ? 'Поиск проводит узкий фокус по назначенному сектору.'
        : 'Наблюдение спокойно сканирует широкий передний сектор.';
  grid.append(note);
  return grid;
}

function selectedSummary(state: SimulationState): HTMLElement {
  const selected = getSelectedUnit(state);
  const block = document.createElement('div');
  block.className = 'game-editor-selected-summary';
  block.innerHTML = `<span>Выбранный боец</span><strong>${escapeHtml(selected ? `${selected.labels.ru} · ${MODE_LABELS[selected.attentionRuntime.mode]}` : 'не выбран')}</strong>`;
  return block;
}

function hint(text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = 'attention-profile-hint';
  element.textContent = text;
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
  input.value = String(Math.round(value / step) * step);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', () => {
    const parsed = Number(input.value);
    const next = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : value));
    input.value = String(next);
    onChange(next);
  });
  return wrapField(label, input);
}

function selectField<T extends string>(
  label: string,
  options: Array<[T, string]>,
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const select = document.createElement('select');
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value as T));
  return wrapField(label, select);
}

function wrapField(label: string, input: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'game-editor-field attention-profile-field';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, input);
  return wrapper;
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

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] ?? character));
}
