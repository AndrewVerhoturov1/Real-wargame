type JsonParameters = Record<string, string | number | boolean | null | { x: number; y: number }>;
type ContactStage = 'cue' | 'suspicion' | 'contact' | 'identified' | 'confirmed';

const STAGE_OPTIONS = [
  ['cue', 'След'],
  ['suspicion', 'Подозрение'],
  ['contact', 'Контакт'],
  ['identified', 'Идентифицирован'],
  ['confirmed', 'Подтверждён'],
] as const;

const DEFAULTS: Readonly<JsonParameters> = {
  minimumStage: 'cue',
  minimumConfidence: 15,
  completionStage: 'identified',
  searchArcDegrees: 120,
  maximumContactAgeSeconds: 10,
  reactToFreshFire: true,
  minimumHoldSeconds: 1.2,
  preferredInvestigationSeconds: 3,
  maximumInvestigationSeconds: 5,
  revisitDelaySeconds: 4,
  switchAdvantagePercent: 25,
  urgentCloserMeters: 12,
  urgentCloserRatio: 0.6,
  confidenceWeight: 0.3,
  proximityWeight: 0.25,
  freshnessWeight: 0.2,
  urgencyWeight: 0.2,
  uncertaintyPenaltyWeight: 0.15,
  currentContactBonus: 10,
};

let scheduled = false;

function scheduleRender(): void {
  if (scheduled || typeof window === 'undefined') return;
  scheduled = true;
  window.requestAnimationFrame(renderControls);
}

function renderControls(): void {
  scheduled = false;
  const textarea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
  const inspector = textarea?.closest<HTMLElement>('.inspector-panel');
  if (!textarea || !inspector || readSelectedNodeType() !== 'InvestigateContact') return;

  const humanPanel = inspector.querySelector<HTMLElement>('.human-node-panel');
  humanPanel?.classList.add('human-hidden-original');
  if (inspector.querySelector('[data-contact-investigation-node-controls]')) return;

  const parameters = applyDefaults(parseParameters(textarea.value));
  writeParameters(textarea, parameters);

  const root = document.createElement('section');
  root.dataset.contactInvestigationNodeControls = 'true';
  root.dataset.contactInvestigationParameterAuthority = 'true';
  root.className = 'attention-node-controls contact-investigation-node-controls';

  const heading = document.createElement('h4');
  heading.textContent = 'Настройка доразведки контактов';
  const note = document.createElement('p');
  note.textContent = 'Нода сама выбирает неизвестный субъективный контакт, удерживает внимание без метаний, переключается на существенно более близкую или срочную угрозу и после идентификации проверяет следующий контакт.';
  root.append(heading, note);

  root.append(sectionHeading('Основные'));
  root.append(
    selectField('Минимальная стадия', STAGE_OPTIONS, readStage(parameters.minimumStage, 'cue'), (value) => {
      parameters.minimumStage = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Минимальная уверенность, %', readNumber(parameters.minimumConfidence, 15), 0, 100, 1, (value) => {
      parameters.minimumConfidence = value;
      writeParameters(textarea, parameters);
    }),
    selectField('Доразведка завершена на стадии', STAGE_OPTIONS, readStage(parameters.completionStage, 'identified'), (value) => {
      parameters.completionStage = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Ширина сектора, °', readNumber(parameters.searchArcDegrees, 120), 1, 360, 1, (value) => {
      parameters.searchArcDegrees = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Максимальный возраст контакта, с', readNumber(parameters.maximumContactAgeSeconds, 10), 0.1, 120, 0.1, (value) => {
      parameters.maximumContactAgeSeconds = value;
      writeParameters(textarea, parameters);
    }),
    checkboxField('Срочно реагировать на признаки огня', readBoolean(parameters.reactToFreshFire, true), (value) => {
      parameters.reactToFreshFire = value;
      writeParameters(textarea, parameters);
    }),
  );

  root.append(sectionHeading('Удержание и переключение'));
  root.append(
    numberField('Минимально смотреть один контакт, с', readNumber(parameters.minimumHoldSeconds, 1.2), 0, 30, 0.1, (value) => {
      parameters.minimumHoldSeconds = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Желательное время проверки, с', readNumber(parameters.preferredInvestigationSeconds, 3), 0, 60, 0.1, (value) => {
      parameters.preferredInvestigationSeconds = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Максимальное время проверки, с', readNumber(parameters.maximumInvestigationSeconds, 5), 0.1, 120, 0.1, (value) => {
      parameters.maximumInvestigationSeconds = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Пауза перед повторной проверкой, с', readNumber(parameters.revisitDelaySeconds, 4), 0, 120, 0.1, (value) => {
      parameters.revisitDelaySeconds = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Преимущество для переключения, %', readNumber(parameters.switchAdvantagePercent, 25), 0, 500, 1, (value) => {
      parameters.switchAdvantagePercent = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Переключиться, если ближе на, м', readNumber(parameters.urgentCloserMeters, 12), 0, 500, 1, (value) => {
      parameters.urgentCloserMeters = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Переключиться, если дистанция меньше, % от текущей', readNumber(parameters.urgentCloserRatio, 0.6) * 100, 0, 100, 1, (value) => {
      parameters.urgentCloserRatio = value / 100;
      writeParameters(textarea, parameters);
    }),
  );

  const advanced = document.createElement('details');
  advanced.className = 'contact-investigation-advanced';
  const advancedSummary = document.createElement('summary');
  advancedSummary.textContent = 'Расширенная оценка';
  advanced.append(advancedSummary,
    numberField('Вес уверенности', readNumber(parameters.confidenceWeight, 0.3), 0, 10, 0.05, (value) => {
      parameters.confidenceWeight = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Вес близости', readNumber(parameters.proximityWeight, 0.25), 0, 10, 0.05, (value) => {
      parameters.proximityWeight = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Вес свежести', readNumber(parameters.freshnessWeight, 0.2), 0, 10, 0.05, (value) => {
      parameters.freshnessWeight = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Вес срочности угрозы', readNumber(parameters.urgencyWeight, 0.2), 0, 10, 0.05, (value) => {
      parameters.urgencyWeight = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Штраф неопределённости', readNumber(parameters.uncertaintyPenaltyWeight, 0.15), 0, 10, 0.05, (value) => {
      parameters.uncertaintyPenaltyWeight = value;
      writeParameters(textarea, parameters);
    }),
    numberField('Бонус удержания текущего контакта', readNumber(parameters.currentContactBonus, 10), 0, 100, 1, (value) => {
      parameters.currentContactBonus = value;
      writeParameters(textarea, parameters);
    }),
  );
  root.append(advanced);

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

function applyDefaults(parameters: JsonParameters): JsonParameters {
  return { ...DEFAULTS, ...parameters };
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

function writeParameters(textarea: HTMLTextAreaElement, parameters: JsonParameters): void {
  textarea.value = JSON.stringify(parameters, null, 2);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function readSelectedNodeType(): string {
  for (const row of document.querySelectorAll<HTMLElement>('.inspector-row')) {
    if (row.querySelector('span')?.textContent?.trim() === 'type') {
      return row.querySelector('code')?.textContent?.trim() ?? '';
    }
  }
  return '';
}

function sectionHeading(text: string): HTMLHeadingElement {
  const heading = document.createElement('h5');
  heading.textContent = text;
  return heading;
}

function fieldWrapper(label: string): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'attention-node-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  wrapper.append(caption);
  return wrapper;
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
  minimum: number,
  maximum: number,
  step: number,
  onChange: (value: number) => void,
): HTMLElement {
  const wrapper = fieldWrapper(label);
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.min = String(minimum);
  input.max = String(maximum);
  input.step = String(step);
  const update = (): void => {
    const parsed = Number(input.value);
    const next = Math.max(minimum, Math.min(maximum, Number.isFinite(parsed) ? parsed : value));
    input.value = String(next);
    onChange(next);
  };
  input.addEventListener('input', update);
  input.addEventListener('change', update);
  wrapper.append(input);
  return wrapper;
}

function checkboxField(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const wrapper = fieldWrapper(label);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrapper.append(input);
  return wrapper;
}

function readStage(value: unknown, fallback: ContactStage): ContactStage {
  return value === 'cue' || value === 'suspicion' || value === 'contact' || value === 'identified' || value === 'confirmed'
    ? value
    : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleRender();
}
