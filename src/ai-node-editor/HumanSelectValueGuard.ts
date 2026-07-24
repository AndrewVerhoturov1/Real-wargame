export interface HumanSelectOption {
  readonly value: string;
  readonly label: string;
  readonly labelRu: string;
}

interface BlackboardSchemaEntry {
  readonly key?: unknown;
  readonly valueKind?: unknown;
  readonly label?: unknown;
  readonly labelRu?: unknown;
}

interface BlackboardGraphLike {
  readonly blackboardDefaults?: Record<string, unknown>;
  readonly blackboardSchema?: readonly unknown[];
}

export interface BlackboardSelectOptions {
  readonly number: readonly HumanSelectOption[];
  readonly boolean: readonly HumanSelectOption[];
}

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';

export function mergeSelectOptionsWithCurrent(
  options: readonly HumanSelectOption[],
  currentValue: string,
): HumanSelectOption[] {
  const normalized = currentValue.trim();
  const unique = deduplicateOptions(options);
  if (!normalized || unique.some((option) => option.value === normalized)) return unique;
  return [
    {
      value: normalized,
      label: `Current value: ${normalized}`,
      labelRu: `Текущее значение: ${normalized}`,
    },
    ...unique,
  ];
}

export function collectBlackboardSelectOptions(graph: BlackboardGraphLike): BlackboardSelectOptions {
  const numeric = new Map<string, HumanSelectOption>();
  const boolean = new Map<string, HumanSelectOption>();

  for (const rawEntry of graph.blackboardSchema ?? []) {
    if (!isRecord(rawEntry)) continue;
    const entry = rawEntry as BlackboardSchemaEntry;
    const key = typeof entry.key === 'string' ? entry.key.trim() : '';
    if (!key) continue;
    const option = {
      value: key,
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label : key,
      labelRu: typeof entry.labelRu === 'string' && entry.labelRu.trim() ? entry.labelRu : key,
    };
    if (entry.valueKind === 'number') numeric.set(key, option);
    if (entry.valueKind === 'boolean') boolean.set(key, option);
  }

  for (const [key, value] of Object.entries(graph.blackboardDefaults ?? {})) {
    if (typeof value !== 'number' && typeof value !== 'boolean') continue;
    const target = typeof value === 'number' ? numeric : boolean;
    if (!target.has(key)) target.set(key, { value: key, label: key, labelRu: key });
  }

  return {
    number: [...numeric.values()],
    boolean: [...boolean.values()],
  };
}

function scheduleGuard(): void {
  if (typeof window === 'undefined' || scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    applySelectValueGuard();
  });
}

function applySelectValueGuard(): void {
  const parameters = readCurrentParameters();
  const memoryOptions = collectBlackboardSelectOptions(readStoredGraph());

  document.querySelectorAll<HTMLSelectElement>('.human-node-panel select.human-field[data-param-key]').forEach((select) => {
    if (select.dataset.selectValueGuardInitialized === 'yes') return;
    const parameterKey = select.dataset.paramKey;
    if (!parameterKey) return;

    const currentValue = typeof parameters[parameterKey] === 'string' ? String(parameters[parameterKey]) : '';
    const dynamicOptions = parameterKey === 'sourceKey' || parameterKey === 'modifierKey'
      ? memoryOptions.number
      : parameterKey === 'flagKey'
        ? memoryOptions.boolean
        : [];

    for (const option of dynamicOptions) appendOptionIfMissing(select, option);

    const merged = mergeSelectOptionsWithCurrent(
      Array.from(select.options).map((option) => ({
        value: option.value,
        label: option.textContent ?? option.value,
        labelRu: option.textContent ?? option.value,
      })),
      currentValue,
    );
    const currentOption = merged.find((option) => option.value === currentValue);
    if (currentOption) prependOptionIfMissing(select, currentOption);

    if (currentValue && Array.from(select.options).some((option) => option.value === currentValue)) {
      select.value = currentValue;
    }
    select.dataset.selectValueGuardInitialized = 'yes';
  });
}

function appendOptionIfMissing(select: HTMLSelectElement, option: HumanSelectOption): void {
  if (Array.from(select.options).some((candidate) => candidate.value === option.value)) return;
  select.append(createOption(option));
}

function prependOptionIfMissing(select: HTMLSelectElement, option: HumanSelectOption): void {
  if (Array.from(select.options).some((candidate) => candidate.value === option.value)) return;
  select.prepend(createOption(option));
}

function createOption(option: HumanSelectOption): HTMLOptionElement {
  const element = document.createElement('option');
  element.value = option.value;
  element.textContent = `${option.labelRu} · ${option.value}`;
  return element;
}

function readCurrentParameters(): Record<string, unknown> {
  const textarea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
  if (!textarea) return {};
  try {
    const parsed = JSON.parse(textarea.value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readStoredGraph(): BlackboardGraphLike {
  try {
    const parsed = JSON.parse(localStorage.getItem(GRAPH_STORAGE_KEY) ?? '{}') as unknown;
    return isRecord(parsed) ? parsed as BlackboardGraphLike : {};
  } catch {
    return {};
  }
}

function deduplicateOptions(options: readonly HumanSelectOption[]): HumanSelectOption[] {
  const result = new Map<string, HumanSelectOption>();
  for (const option of options) if (!result.has(option.value)) result.set(option.value, option);
  return [...result.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

let scheduled = false;

if (typeof document !== 'undefined' && typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(scheduleGuard);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleGuard();
}
