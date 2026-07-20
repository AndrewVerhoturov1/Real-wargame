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
import {
  TACTICAL_POSITION_SETTINGS_GROUPS,
  type TacticalPositionBooleanFieldDefinition,
  type TacticalPositionNumericFieldDefinition,
} from '../core/tactical/TacticalPositionSettingsSchema';
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
    content.append(hint(
      'Эти параметры используют общую схему с самостоятельным редактором ИИ. '
      + 'Сравнительные пороги возвращают реальные позиции пригнувшись и лёжа, а веса целей управляют продвижением, отходом и продолжением приказа.',
    ));

    for (const definition of TACTICAL_POSITION_SETTINGS_GROUPS) {
      content.append(
        group(definition.titleRu),
        grid([
          ...definition.numericFields.map((field) => numericSettingField(draft, field)),
          ...(definition.booleanFields ?? []).map((field) => booleanSettingField(draft, field)),
        ], onChanged),
      );
    }

    content.append(
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

function numericSettingField(
  draft: TacticalPositionSettings,
  definition: TacticalPositionNumericFieldDefinition,
): HTMLElement {
  return numberField(
    definition.labelRu,
    definition.helpRu,
    draft[definition.key],
    definition.min,
    definition.max,
    definition.step,
    (value) => { draft[definition.key] = value; },
  );
}

function booleanSettingField(
  draft: TacticalPositionSettings,
  definition: TacticalPositionBooleanFieldDefinition,
): HTMLElement {
  return checkboxField(
    definition.labelRu,
    definition.helpRu,
    draft[definition.key],
    (value) => { draft[definition.key] = value; },
  );
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
  help: string,
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
  input.title = help;
  input.addEventListener('change', () => {
    const parsed = Number(input.value);
    const next = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : value));
    input.value = formatStepNumber(next, step);
    onChange(next);
  });
  return wrapField(label, help, input);
}

function checkboxField(
  label: string,
  help: string,
  value: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.title = help;
  input.addEventListener('change', () => onChange(input.checked));
  const wrapper = wrapField(label, help, input);
  wrapper.classList.add('checkbox');
  return wrapper;
}

function wrapField(label: string, help: string, input: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'game-editor-field attention-profile-field';
  wrapper.title = help;
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
