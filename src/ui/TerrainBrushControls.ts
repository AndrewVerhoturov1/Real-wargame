import { clearForestLayer, clearHeightLayer } from '../core/map/MapPaint';
import type { SimulationState } from '../core/simulation/SimulationState';

const HEIGHT_OPTIONS = [
  { value: -2, label: '-2 глубокая низина' },
  { value: -1, label: '-1 низина' },
  { value: 0, label: '0 ровно / стереть высоту' },
  { value: 1, label: '+1 подъём' },
  { value: 2, label: '+2 холм' },
  { value: 3, label: '+3 высокая местность' },
  { value: 4, label: '+4 гребень / вершина' },
];

const FOREST_OPTIONS = [
  { value: 0, label: '0 нет леса / стереть лес' },
  { value: 1, label: '1 редкий лес' },
  { value: 2, label: '2 густой лес' },
];

export function installTerrainBrushControls(debugPanel: HTMLElement, state: SimulationState): void {
  const hud = debugPanel.closest<HTMLElement>('#hud');

  if (!hud) {
    return;
  }

  ensureBrushDefaults(state);

  const content = document.createElement('div');
  content.className = 'terrain-brush-content';

  const status = createSmallText('Выбери кисть и рисуй по карте левой кнопкой мыши.');
  status.className = 'editor-status-block';
  const heightButton = createButton('Кисть: высота');
  const forestButton = createButton('Кисть: лес');
  const selectButton = createButton('Вернуться к выбору');

  const heightSelect = createNumberSelect(HEIGHT_OPTIONS, getBrushState(state).heightBrushLevel, (value) => {
    getBrushState(state).heightBrushLevel = value;
    state.editor.lastMessage = `Кисть высоты: ${formatHeight(value)}.`;
    renderBrushStatus(status, state);
  });

  const forestSelect = createNumberSelect(FOREST_OPTIONS, getBrushState(state).forestBrushKind, (value) => {
    getBrushState(state).forestBrushKind = value;
    state.editor.lastMessage = `Кисть леса: ${formatForest(value)}.`;
    renderBrushStatus(status, state);
  });

  const brushSizeInput = createNumberInput(getBrushState(state).brushSizeCells, 1, 12, 1, (value) => {
    getBrushState(state).brushSizeCells = value;
    state.editor.lastMessage = `Размер кисти: ${value} клет.`;
    renderBrushStatus(status, state);
  });

  heightButton.addEventListener('click', () => {
    setEditorTool(state, 'paint_height');
    state.editor.lastMessage = 'Кисть высоты включена. Веди левой кнопкой по карте.';
    renderBrushStatus(status, state);
  });

  forestButton.addEventListener('click', () => {
    setEditorTool(state, 'paint_forest');
    state.editor.lastMessage = 'Кисть леса включена. Веди левой кнопкой по карте.';
    renderBrushStatus(status, state);
  });

  selectButton.addEventListener('click', () => {
    setEditorTool(state, 'select');
    state.editor.lastMessage = 'Инструмент выбора включён.';
    renderBrushStatus(status, state);
  });

  const clearHeightButton = createButton('Очистить высоты');
  clearHeightButton.addEventListener('click', () => {
    if (window.confirm('Сбросить все высоты карты к 0?')) {
      clearHeightLayer(state);
      renderBrushStatus(status, state);
    }
  });

  const clearForestButton = createButton('Очистить лес');
  clearForestButton.addEventListener('click', () => {
    if (window.confirm('Убрать весь лес со слоя леса?')) {
      clearForestLayer(state);
      renderBrushStatus(status, state);
    }
  });

  const buttonRow = document.createElement('div');
  buttonRow.className = 'editor-button-row';
  buttonRow.append(heightButton, forestButton, selectButton);

  const clearRow = document.createElement('div');
  clearRow.className = 'editor-button-row';
  clearRow.append(clearHeightButton, clearForestButton);

  content.append(
    createSmallText('Высоты и лес создаются кистями. Данные остаются по клеткам, а карта рисует их как слой.'),
    buttonRow,
    createLabeledControl('Уровень высоты', heightSelect),
    createLabeledControl('Слой леса', forestSelect),
    createLabeledControl('Размер кисти, клеток', brushSizeInput),
    clearRow,
    status,
  );

  const slot = document.querySelector<HTMLElement>('.editor-map-brush-slot');
  if (slot) {
    slot.appendChild(content);
  } else {
    const section = document.createElement('details');
    section.className = 'hud-section editor-section terrain-brush-section';
    section.open = true;
    const summary = document.createElement('summary');
    summary.textContent = 'Кисти карты: высота и лес';
    section.append(summary, content);
    hud.appendChild(section);
  }

  window.setInterval(() => {
    renderBrushStatus(status, state);
  }, 300);
}

function ensureBrushDefaults(state: SimulationState): void {
  const brush = getBrushState(state);
  brush.brushSizeCells ??= 3;
  brush.heightBrushLevel ??= 2;
  brush.forestBrushKind ??= 1;
}

function getBrushState(state: SimulationState): typeof state.editor & {
  brushSizeCells: number;
  heightBrushLevel: number;
  forestBrushKind: number;
} {
  return state.editor as typeof state.editor & {
    brushSizeCells: number;
    heightBrushLevel: number;
    forestBrushKind: number;
  };
}

function setEditorTool(state: SimulationState, tool: string): void {
  (state.editor as unknown as { tool: string }).tool = tool;
}

function renderBrushStatus(status: HTMLElement, state: SimulationState): void {
  const brush = getBrushState(state);
  const tool = String(state.editor.tool);
  const toolName = tool === 'paint_height'
    ? 'Высота'
    : tool === 'paint_forest'
      ? 'Лес'
      : 'не кисть';

  status.textContent = [
    `Активно: ${toolName}`,
    `Высота: ${formatHeight(brush.heightBrushLevel)}`,
    `Лес: ${formatForest(brush.forestBrushKind)}`,
    `Размер кисти: ${brush.brushSizeCells} клет.`,
    `Сообщение: ${state.editor.lastMessage}`,
  ].join('\n');
}

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.pointerEvents = 'auto';
  button.style.cursor = 'pointer';
  return button;
}

function createSmallText(text: string): HTMLElement {
  const element = document.createElement('div');
  element.textContent = text;
  element.className = 'editor-help-text';
  return element;
}

function createLabeledControl(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'editor-labeled-control';
  wrapper.append(label, control);
  return wrapper;
}

function createNumberSelect(
  options: Array<{ value: number; label: string }>,
  value: number,
  onChange: (value: number) => void,
): HTMLSelectElement {
  const select = document.createElement('select');

  for (const option of options) {
    const item = document.createElement('option');
    item.value = String(option.value);
    item.textContent = option.label;
    select.appendChild(item);
  }

  select.value = String(value);
  select.addEventListener('change', () => onChange(Number(select.value)));
  return select;
}

function createNumberInput(
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', () => {
    const parsed = Number(input.value);
    const clamped = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : value));
    input.value = String(clamped);
    onChange(clamped);
  });
  return input;
}

function formatHeight(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatForest(value: number): string {
  switch (value) {
    case 1:
      return 'редкий лес';
    case 2:
      return 'густой лес';
    case 0:
    default:
      return 'нет леса';
  }
}
