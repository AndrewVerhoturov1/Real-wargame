import type { MapObjectKind } from '../core/map/MapModel';
import {
  deleteSelectedEditorTargets,
  getSelectedMapObject,
  getSelectedUnit,
  type EditorTool,
  type SimulationState,
  updateSelectedEditorObject,
} from '../core/simulation/SimulationState';
import type { UnitType } from '../core/units/UnitModel';

const OBJECT_KIND_OPTIONS: Array<{ value: MapObjectKind; label: string }> = [
  { value: 'tree', label: 'Дерево' },
  { value: 'rock', label: 'Камень' },
  { value: 'structure', label: 'Дом' },
  { value: 'cover', label: 'Укрытие' },
  { value: 'ditch', label: 'Канава' },
  { value: 'crates', label: 'Ящики' },
  { value: 'fence', label: 'Забор' },
  { value: 'post', label: 'Пост' },
  { value: 'logs', label: 'Брёвна' },
  { value: 'well', label: 'Колодец' },
  { value: 'bridge', label: 'Мост' },
];

const UNIT_TYPE_OPTIONS: Array<{ value: UnitType; label: string }> = [
  { value: 'infantry_squad', label: 'Пехотный юнит' },
  { value: 'scout_team', label: 'Разведчик' },
  { value: 'support_team', label: 'Поддержка' },
];

const TOOL_OPTIONS: Array<{ value: EditorTool; label: string; hint: string }> = [
  { value: 'select', label: 'Выбрать', hint: 'клик по предмету или юниту' },
  { value: 'spawn_object', label: 'Создать предмет', hint: 'клик по карте создаёт предмет' },
  { value: 'spawn_unit', label: 'Создать юнит', hint: 'клик по карте создаёт юнит' },
  { value: 'delete', label: 'Удалить', hint: 'клик по предмету или юниту удаляет его' },
];

export function installEditorControls(debugPanel: HTMLElement, state: SimulationState): void {
  const hud = debugPanel.closest<HTMLElement>('#hud');

  if (!hud) {
    return;
  }

  const root = document.createElement('div');
  root.className = 'editor-controls';
  root.style.pointerEvents = 'auto';
  root.style.display = 'grid';
  root.style.gap = '8px';
  root.style.marginTop = '8px';

  const enabledButton = createButton('Редактор: выкл');
  enabledButton.addEventListener('click', () => {
    state.editor.enabled = !state.editor.enabled;
    state.editor.lastMessage = state.editor.enabled
      ? 'Редактор включён. Левый клик работает как инструмент редактора.'
      : 'Редактор выключен. Левый клик снова выбирает юнитов, правый клик отдаёт приказ.';
    renderEditorStatus(status, state, enabledButton);
  });

  const toolRow = document.createElement('div');
  toolRow.style.display = 'flex';
  toolRow.style.flexWrap = 'wrap';
  toolRow.style.gap = '6px';

  for (const option of TOOL_OPTIONS) {
    const button = createButton(option.label);
    button.title = option.hint;
    button.addEventListener('click', () => {
      state.editor.tool = option.value;
      state.editor.lastMessage = `Инструмент: ${option.label} — ${option.hint}.`;
      renderEditorStatus(status, state, enabledButton);
    });
    toolRow.appendChild(button);
  }

  const objectKindSelect = createSelect(
    OBJECT_KIND_OPTIONS,
    state.editor.objectKind,
    (value) => {
      state.editor.objectKind = value as MapObjectKind;
      state.editor.lastMessage = 'Тип создаваемого предмета изменён.';
      renderEditorStatus(status, state, enabledButton);
    },
  );

  const unitTypeSelect = createSelect(
    UNIT_TYPE_OPTIONS,
    state.editor.unitType,
    (value) => {
      state.editor.unitType = value as UnitType;
      state.editor.lastMessage = 'Тип создаваемого юнита изменён.';
      renderEditorStatus(status, state, enabledButton);
    },
  );

  const widthInput = createNumberInput(state.editor.objectWidthCells, 0.1, 20, 0.1, (value) => {
    state.editor.objectWidthCells = value;
  });
  const heightInput = createNumberInput(state.editor.objectHeightCells, 0.1, 20, 0.1, (value) => {
    state.editor.objectHeightCells = value;
  });
  const rotationInput = createNumberInput(state.editor.objectRotationDegrees, -360, 360, 5, (value) => {
    state.editor.objectRotationDegrees = value;
  });

  const applyObjectButton = createButton('Применить к выбранному предмету');
  applyObjectButton.addEventListener('click', () => {
    updateSelectedEditorObject(state, {
      widthCells: state.editor.objectWidthCells,
      heightCells: state.editor.objectHeightCells,
      rotationRadians: degreesToRadians(state.editor.objectRotationDegrees),
    });
    renderEditorStatus(status, state, enabledButton);
  });

  const deleteSelectedButton = createButton('Удалить выбранное');
  deleteSelectedButton.addEventListener('click', () => {
    deleteSelectedEditorTargets(state);
    renderEditorStatus(status, state, enabledButton);
  });

  const status = document.createElement('pre');
  status.style.margin = '0';
  status.style.whiteSpace = 'pre-wrap';
  status.style.fontSize = '12px';
  status.style.lineHeight = '1.45';
  status.style.color = '#f6edcf';

  root.append(
    enabledButton,
    createSmallText('Инструмент редактора:'),
    toolRow,
    createLabeledControl('Тип предмета', objectKindSelect),
    createLabeledControl('Тип юнита', unitTypeSelect),
    createLabeledControl('Ширина предмета, клеток', widthInput),
    createLabeledControl('Высота предмета, клеток', heightInput),
    createLabeledControl('Поворот предмета, градусов', rotationInput),
    applyObjectButton,
    deleteSelectedButton,
    status,
  );

  const section = createSection('Редактор карты', root, false);
  hud.appendChild(section);
  renderEditorStatus(status, state, enabledButton);
  window.setInterval(() => renderEditorStatus(status, state, enabledButton), 300);
}

function createSection(title: string, content: HTMLElement, open: boolean): HTMLDetailsElement {
  const section = document.createElement('details');
  section.className = 'hud-section editor-section';
  section.open = open;
  section.style.marginTop = '10px';
  section.style.pointerEvents = 'auto';

  const summary = document.createElement('summary');
  summary.textContent = title;
  summary.style.cursor = 'pointer';
  summary.style.color = '#fff2a8';
  summary.style.fontWeight = '700';
  summary.style.fontSize = '13px';
  summary.style.padding = '7px 0';
  section.append(summary, content);

  return section;
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
  element.style.fontSize = '12px';
  element.style.color = '#f6edcf';
  return element;
}

function createLabeledControl(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.style.display = 'grid';
  wrapper.style.gap = '4px';
  wrapper.style.fontSize = '12px';
  wrapper.style.color = '#f6edcf';
  wrapper.append(label, control);
  return wrapper;
}

function createSelect<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
  onChange: (value: T) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.value = value;

  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  }

  select.addEventListener('change', () => onChange(select.value as T));
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

function renderEditorStatus(status: HTMLElement, state: SimulationState, enabledButton: HTMLButtonElement): void {
  const selectedObject = getSelectedMapObject(state);
  const selectedUnit = getSelectedUnit(state);
  const tool = TOOL_OPTIONS.find((option) => option.value === state.editor.tool);

  enabledButton.textContent = state.editor.enabled ? 'Редактор: вкл' : 'Редактор: выкл';

  status.textContent = [
    `Состояние: ${state.editor.enabled ? 'включён' : 'выключен'}`,
    `Инструмент: ${tool?.label ?? state.editor.tool}`,
    `Предмет: ${selectedObject ? selectedObject.id : 'не выбран'}`,
    `Юнит: ${selectedUnit ? selectedUnit.id : 'не выбран'}`,
    `Размер нового предмета: ${state.editor.objectWidthCells}×${state.editor.objectHeightCells} клеток`,
    `Поворот нового предмета: ${state.editor.objectRotationDegrees}°`,
    `Сообщение: ${state.editor.lastMessage}`,
    '',
    'Как пользоваться:',
    '1. Включи редактор.',
    '2. Выбери инструмент.',
    '3. Кликни по карте.',
    '4. Для изменения размера/поворота выбери предмет, задай числа и нажми применить.',
  ].join('\n');
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
