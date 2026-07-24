type JsonParameters = Record<string, string | number | boolean | null | { x: number; y: number }>;

export type SearchDirectionChoice = 'fixed' | 'suspected_contact' | 'blackboard_position';

const MODE_OPTIONS = [
  ['march', 'Марш'],
  ['observe', 'Наблюдение'],
  ['search', 'Поиск цели'],
  ['engage', 'Стрельба'],
] as const;

const SEARCH_DIRECTION_OPTIONS = [
  ['fixed', 'Фиксированный угол'],
  ['suspected_contact', 'Предполагаемая позиция врага'],
  ['blackboard_position', 'Другая позиция из памяти'],
] as const;

let scheduled = false;

export function resolveSearchDirectionChoice(parameters: JsonParameters): SearchDirectionChoice {
  if (parameters.centerSource !== 'blackboard_position') return 'fixed';
  const originPositionKey = readString(parameters.originPositionKey, 'self_position');
  const targetPositionKey = readString(parameters.targetPositionKey, 'suspected_enemy_position');
  return originPositionKey === 'self_position' && targetPositionKey === 'suspected_enemy_position'
    ? 'suspected_contact'
    : 'blackboard_position';
}

export function applySearchDirectionChoice(
  parameters: JsonParameters,
  choice: SearchDirectionChoice,
): JsonParameters {
  const next = { ...parameters };
  if (choice === 'fixed') {
    next.centerSource = 'fixed';
    return next;
  }
  next.centerSource = 'blackboard_position';
  if (choice === 'suspected_contact') {
    next.originPositionKey = 'self_position';
    next.targetPositionKey = 'suspected_enemy_position';
  } else {
    next.originPositionKey = readString(next.originPositionKey, 'self_position');
    next.targetPositionKey = readString(next.targetPositionKey, 'suspected_enemy_position');
  }
  return next;
}

function scheduleRender(): void {
  if (scheduled || typeof window === 'undefined') return;
  scheduled = true;
  window.requestAnimationFrame(renderFriendlyControls);
}

function renderFriendlyControls(): void {
  scheduled = false;
  const textarea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
  const inspector = textarea?.closest<HTMLElement>('.inspector-panel');
  if (!textarea || !inspector) return;

  const type = readSelectedNodeType();
  if (type !== 'SetAttentionMode' && type !== 'SetSearchSector' && type !== 'ClearAttentionOverride') return;

  const humanPanel = inspector.querySelector<HTMLElement>('.human-node-panel');
  humanPanel?.classList.add('human-hidden-original');
  if (inspector.querySelector('[data-attention-node-controls]')) return;

  const parameters = parseParameters(textarea.value);
  const root = document.createElement('section');
  root.dataset.attentionNodeControls = 'true';
  root.dataset.attentionParameterAuthority = 'true';
  root.className = 'attention-node-controls';

  const heading = document.createElement('h4');
  heading.textContent = type === 'SetAttentionMode'
    ? 'Настройка режима внимания'
    : type === 'SetSearchSector'
      ? 'Настройка сектора поиска'
      : 'Автоматическое внимание';
  const note = document.createElement('p');
  note.textContent = type === 'ClearAttentionOverride'
    ? 'Боец снова сам выбирает режим: марш при движении, стрельба при огне и обычное наблюдение в покое.'
    : type === 'SetSearchSector'
      ? 'Выбери, куда боец должен направить поиск. Углы и скорость самого профиля внимания настраиваются в данных бойца.'
      : 'Здесь выбирается режим внимания. Его постоянные углы и скорость настраиваются в данных бойца.';
  root.append(heading, note);

  if (type === 'SetAttentionMode') {
    root.append(selectField('Режим', MODE_OPTIONS, readString(parameters.mode, 'observe'), (value) => {
      parameters.mode = value;
      writeParameters(textarea, parameters);
    }));
  }

  if (type === 'SetSearchSector') {
    const directionChoice = resolveSearchDirectionChoice(parameters);
    root.append(selectField('Куда направить внимание', SEARCH_DIRECTION_OPTIONS, directionChoice, (value) => {
      replaceParameters(parameters, applySearchDirectionChoice(parameters, value));
      writeParameters(textarea, parameters);
      root.remove();
      scheduleRender();
    }));

    if (directionChoice === 'fixed') {
      root.append(numberField('Центр сектора, °', readNumber(parameters.centerDegrees, 0), 0, 359, 1, (value) => {
        parameters.centerDegrees = value;
        writeParameters(textarea, parameters);
      }));
    } else if (directionChoice === 'suspected_contact') {
      const presetNote = document.createElement('p');
      presetNote.textContent = 'Направление автоматически считается от позиции бойца к предполагаемой позиции врага. Внутренние ключи подставляются автоматически.';
      root.append(presetNote);
    } else {
      root.append(
        textField('Ключ позиции бойца', readString(parameters.originPositionKey, 'self_position'), (value) => {
          parameters.originPositionKey = value || 'self_position';
          writeParameters(textarea, parameters);
        }),
        textField('Ключ позиции цели', readString(parameters.targetPositionKey, 'suspected_enemy_position'), (value) => {
          parameters.targetPositionKey = value || 'suspected_enemy_position';
          writeParameters(textarea, parameters);
        }),
      );
    }

    root.append(numberField('Ширина сектора, °', readNumber(parameters.arcDegrees, 120), 1, 360, 1, (value) => {
      parameters.arcDegrees = value;
      writeParameters(textarea, parameters);
    }));
  }

  if (type !== 'ClearAttentionOverride') {
    root.append(textField('Объяснение', readString(parameters.reasonRu, defaultReason(type)), (value) => {
      parameters.reasonRu = value;
      writeParameters(textarea, parameters);
    }));
  }

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'ai-editor-button primary';
  saveButton.textContent = 'Сохранить параметры';
  saveButton.addEventListener('click', () => {
    writeParameters(textarea, parameters);
    document.querySelector<HTMLButtonElement>('#save-node')?.click();
  });
  root.append(saveButton);

  const summaryCard = inspector.querySelector<HTMLElement>('.inspector-card');
  if (humanPanel) humanPanel.insertAdjacentElement('afterend', root);
  else if (summaryCard) summaryCard.insertAdjacentElement('afterend', root);
  else inspector.prepend(root);
}

function readSelectedNodeType(): string {
  for (const row of document.querySelectorAll<HTMLElement>('.inspector-row')) {
    if (row.querySelector('span')?.textContent?.trim() === 'type') {
      return row.querySelector('code')?.textContent?.trim() ?? '';
    }
  }
  return '';
}

function parseParameters(value: string): JsonParameters {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as JsonParameters
      : {};
  } catch {
    return {};
  }
}

function replaceParameters(target: JsonParameters, source: JsonParameters): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function writeParameters(textarea: HTMLTextAreaElement, parameters: JsonParameters): void {
  textarea.value = JSON.stringify(parameters, null, 2);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function selectField<T extends string>(
  label: string,
  options: readonly (readonly [T, string])[],
  value: string,
  onChange: (value: T) => void,
): HTMLElement {
  const wrapper = fieldWrapper(label);
  const select = document.createElement('select');
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value as T));
  wrapper.append(select);
  return wrapper;
}

function numberField(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): HTMLElement {
  const wrapper = fieldWrapper(label);
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const update = (): void => {
    const parsed = Number(input.value);
    const next = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : value));
    input.value = String(next);
    onChange(next);
  };
  input.addEventListener('input', update);
  input.addEventListener('change', update);
  wrapper.append(input);
  return wrapper;
}

function textField(label: string, value: string, onChange: (value: string) => void): HTMLElement {
  const wrapper = fieldWrapper(label);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('input', () => onChange(input.value.trim()));
  wrapper.append(input);
  return wrapper;
}

function fieldWrapper(label: string): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'attention-node-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  wrapper.append(caption);
  return wrapper;
}

function defaultReason(type: string): string {
  return type === 'SetSearchSector' ? 'Осмотреть указанный сектор.' : 'Переключить режим внимания.';
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleRender();
}
