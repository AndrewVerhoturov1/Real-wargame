import './tactical-position-node-ui.css';
import {
  TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS,
  TACTICAL_POSITION_NODE_PARAMETER_GROUPS,
  normalizeTacticalPositionNodeParameters,
  resetTacticalPositionNodeParameter,
  resetTacticalPositionNodeParameterGroup,
  type TacticalPositionNodeParameterDescriptor,
  type TacticalPositionNodeParameters,
} from '../core/tactical/TacticalPositionNodeSettings';

const ROOT_SELECTOR = '.tactical-position-settings';

export function renderTacticalPositionParameterFields(
  parameters: Readonly<Record<string, unknown>> | undefined,
): string {
  const normalized = normalizeTacticalPositionNodeParameters(parameters);
  return `<div class="tactical-position-settings" data-node-type="CreateTacticalPositionCandidates">${TACTICAL_POSITION_NODE_PARAMETER_GROUPS.map((group) => {
    const fields = TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS.filter((descriptor) => descriptor.group === group.id);
    if (fields.length === 0) return '';
    return `<details class="tactical-setting-group" data-tactical-group="${escapeAttribute(group.id)}" ${group.collapsedByDefault ? '' : 'open'}>
      <summary><span class="tactical-setting-summary-copy">${escapeHtml(group.labelRu)}<small>${escapeHtml(group.descriptionRu)}</small></span><button class="tactical-setting-group-reset" data-reset-tactical-group="${escapeAttribute(group.id)}" type="button" title="Вернуть значения группы по умолчанию">Сбросить</button></summary>
      <div class="tactical-setting-group-body">${fields.map((descriptor) => renderField(descriptor, normalized[descriptor.id])).join('')}</div>
    </details>`;
  }).join('')}</div>`;
}

export function readTacticalPositionParameterFields(
  container: ParentNode,
  fallback: Readonly<Record<string, unknown>>,
): TacticalPositionNodeParameters {
  const next: Record<string, unknown> = { ...fallback };
  container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.tactical-position-parameter').forEach((field) => {
    const id = field.dataset.paramId;
    if (!id || field.dataset.positionAxis) return;
    const kind = field.dataset.paramKind;
    next[id] = kind === 'boolean' && field instanceof HTMLInputElement
      ? field.checked
      : kind === 'number'
        ? Number(field.value)
        : field.value;
  });
  const positionX = container.querySelector<HTMLInputElement>('.tactical-position-parameter[data-param-id="targetPoint"][data-position-axis="x"]');
  const positionY = container.querySelector<HTMLInputElement>('.tactical-position-parameter[data-param-id="targetPoint"][data-position-axis="y"]');
  next.targetPoint = positionX?.value.trim() && positionY?.value.trim()
    ? { x: Number(positionX.value), y: Number(positionY.value) }
    : null;
  return normalizeTacticalPositionNodeParameters(next);
}

export function isTacticalPositionParameterContainer(container: ParentNode): boolean {
  return Boolean(container.querySelector(ROOT_SELECTOR));
}

function renderField(descriptor: TacticalPositionNodeParameterDescriptor, value: unknown): string {
  const title = descriptor.descriptionRu || descriptor.labelRu;
  const range = descriptor.kind === 'number'
    ? `<span class="tactical-setting-range">${descriptor.minimum !== undefined ? `от ${descriptor.minimum}` : ''}${descriptor.maximum !== undefined ? ` до ${descriptor.maximum}` : ''}${descriptor.step !== undefined ? ` · шаг ${descriptor.step}` : ''}</span>`
    : '';
  return `<label class="tactical-setting-field" data-tactical-field="${escapeAttribute(descriptor.id)}" title="${escapeAttribute(title)}">
    <span class="tactical-setting-field-head"><span>${escapeHtml(descriptor.labelRu)}</span><button class="tactical-setting-reset" data-reset-tactical-param="${escapeAttribute(descriptor.id)}" type="button" title="Вернуть параметр по умолчанию">↺</button></span>
    ${renderControl(descriptor, value)}
    ${range}
    <small class="tactical-setting-help">${escapeHtml(descriptor.descriptionRu)}</small>
  </label>`;
}

function renderControl(descriptor: TacticalPositionNodeParameterDescriptor, value: unknown): string {
  if (descriptor.kind === 'boolean') {
    return `<span class="tactical-setting-control-row"><input class="tactical-position-parameter" data-param-id="${escapeAttribute(descriptor.id)}" data-param-kind="boolean" type="checkbox" ${value === true ? 'checked' : ''} /><span class="tactical-setting-unit">да/нет</span></span>`;
  }
  if (descriptor.kind === 'enum') {
    return `<span class="tactical-setting-control-row"><select class="tactical-position-parameter" data-param-id="${escapeAttribute(descriptor.id)}" data-param-kind="enum">${(descriptor.options ?? []).map((option) => `<option value="${escapeAttribute(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.labelRu)}</option>`).join('')}</select><span class="tactical-setting-unit"></span></span>`;
  }
  if (descriptor.kind === 'position') {
    const position = readPosition(value);
    return `<span class="tactical-setting-position">
      <input class="tactical-position-parameter" data-param-id="${escapeAttribute(descriptor.id)}" data-param-kind="number" data-position-axis="x" type="number" step="any" value="${position ? escapeAttribute(String(position.x)) : ''}" placeholder="X" />
      <input class="tactical-position-parameter" data-param-id="${escapeAttribute(descriptor.id)}" data-param-kind="number" data-position-axis="y" type="number" step="any" value="${position ? escapeAttribute(String(position.y)) : ''}" placeholder="Y" />
    </span>`;
  }
  const type = descriptor.kind === 'number' ? 'number' : 'text';
  const numericAttributes = descriptor.kind === 'number'
    ? `${descriptor.minimum !== undefined ? ` min="${descriptor.minimum}"` : ''}${descriptor.maximum !== undefined ? ` max="${descriptor.maximum}"` : ''}${descriptor.step !== undefined ? ` step="${descriptor.step}"` : ' step="any"'}`
    : '';
  const unit = descriptor.unit ? escapeHtml(descriptor.unit) : '';
  if (descriptor.kind === 'number' && descriptor.slider) {
    return `<span class="tactical-setting-control-row has-slider">
      <input class="tactical-setting-slider" data-slider-for="${escapeAttribute(descriptor.id)}" type="range" value="${escapeAttribute(String(value ?? ''))}"${numericAttributes} />
      <input class="tactical-position-parameter" data-param-id="${escapeAttribute(descriptor.id)}" data-param-kind="number" type="number" value="${escapeAttribute(String(value ?? ''))}"${numericAttributes} />
      <span class="tactical-setting-unit">${unit}</span>
    </span>`;
  }
  return `<span class="tactical-setting-control-row"><input class="tactical-position-parameter" data-param-id="${escapeAttribute(descriptor.id)}" data-param-kind="${escapeAttribute(descriptor.kind)}" type="${type}" value="${escapeAttribute(String(value ?? ''))}"${numericAttributes} /><span class="tactical-setting-unit">${unit}</span></span>`;
}

function installTacticalPositionUiEvents(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target?.closest(ROOT_SELECTOR)) return;
    if (target.matches('.tactical-setting-slider')) {
      const id = target.dataset.sliderFor;
      const numberField = id ? target.closest(ROOT_SELECTOR)?.querySelector<HTMLInputElement>(`.tactical-position-parameter[data-param-id="${cssEscape(id)}"]`) : null;
      if (numberField) numberField.value = target.value;
      return;
    }
    if (target.matches('.tactical-position-parameter[data-param-kind="number"]')) {
      const id = target.dataset.paramId;
      const slider = id ? target.closest(ROOT_SELECTOR)?.querySelector<HTMLInputElement>(`.tactical-setting-slider[data-slider-for="${cssEscape(id)}"]`) : null;
      if (slider && target.value !== '') slider.value = target.value;
    }
  });
  document.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-reset-tactical-param], [data-reset-tactical-group]');
    if (!button) return;
    const root = button.closest<HTMLElement>(ROOT_SELECTOR);
    if (!root) return;
    event.preventDefault();
    event.stopPropagation();
    const current = readTacticalPositionParameterFields(root, {});
    const next = button.dataset.resetTacticalParam
      ? resetTacticalPositionNodeParameter(current, button.dataset.resetTacticalParam)
      : resetTacticalPositionNodeParameterGroup(current, button.dataset.resetTacticalGroup as Parameters<typeof resetTacticalPositionNodeParameterGroup>[1]);
    writeValues(root, next);
  });
}

function writeValues(root: HTMLElement, values: TacticalPositionNodeParameters): void {
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.tactical-position-parameter').forEach((field) => {
    const id = field.dataset.paramId;
    if (!id) return;
    if (field.dataset.positionAxis) {
      const position = readPosition(values[id]);
      field.value = position ? String(position[field.dataset.positionAxis as 'x' | 'y']) : '';
      return;
    }
    const value = values[id];
    if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = value === true;
    else field.value = value === null || value === undefined ? '' : String(value);
  });
  root.querySelectorAll<HTMLInputElement>('.tactical-setting-slider').forEach((slider) => {
    const value = slider.dataset.sliderFor ? values[slider.dataset.sliderFor] : undefined;
    if (typeof value === 'number') slider.value = String(value);
  });
}

function readPosition(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const x = (value as { x?: unknown }).x;
  const y = (value as { y?: unknown }).y;
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y) ? { x, y } : null;
}
function cssEscape(value: string): string { return value.replace(/(["\\])/g, '\\$1'); }
function escapeHtml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function escapeAttribute(value: string): string { return escapeHtml(value); }

installTacticalPositionUiEvents();
