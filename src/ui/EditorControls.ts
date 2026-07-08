import type { MapObjectKind } from '../core/map/MapModel';
import {
  clearEditorScene,
  deleteSelectedEditorTargets,
  getSelectedMapObject,
  getSelectedUnit,
  nudgeSelectedEditorObject,
  resizeSelectedEditorObject,
  rotateSelectedEditorObject,
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
  { value: 'select', label: 'Выбрать / тянуть', hint: 'клик выбирает, зажатая мышь двигает, ручки меняют размер и поворот' },
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
  root.style.gap = '10px';
  root.style.marginTop = '8px';

  const enabledButton = createButton('Редактор: выкл');
  const floatingButton = createFloatingEditorButton();
  const section = createSection('Инспектор редактора', root, false);

  enabledButton.addEventListener('click', () => toggleEditorMode(hud, state, section, enabledButton, floatingButton, status));
  floatingButton.addEventListener('click', () => toggleEditorMode(hud, state, section, enabledButton, floatingButton, status));

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
      renderEditorStatus(status, state, enabledButton, floatingButton, section);
    });
    toolRow.appendChild(button);
  }

  const layersPanel = document.createElement('div');
  layersPanel.style.display = 'grid';
  layersPanel.style.gap = '5px';
  layersPanel.append(
    createLayerToggle('👁 Предметы', state.editor.layers.objects, (checked) => {
      state.editor.layers.objects = checked;
      if (!checked) {
        state.editor.selectedObjectId = null;
      }
      state.editor.lastMessage = checked ? 'Слой предметов включён.' : 'Слой предметов скрыт.';
      renderEditorStatus(status, state, enabledButton, floatingButton, section);
    }),
    createLayerToggle('👁 Юниты', state.editor.layers.units, (checked) => {
      state.editor.layers.units = checked;
      if (!checked) {
        state.selectedUnitId = null;
        state.selectedUnitIds = [];
      }
      state.editor.lastMessage = checked ? 'Слой юнитов включён.' : 'Слой юнитов скрыт.';
      renderEditorStatus(status, state, enabledButton, floatingButton, section);
    }),
    createLayerToggle('👁 Зоны параметров', state.editor.layers.pressureZones, (checked) => {
      state.editor.layers.pressureZones = checked;
      state.editor.lastMessage = checked ? 'Слой зон включён.' : 'Слой зон скрыт.';
      renderEditorStatus(status, state, enabledButton, floatingButton, section);
    }),
  );

  const objectKindSelect = createSelect(
    OBJECT_KIND_OPTIONS,
    state.editor.objectKind,
    (value) => {
      state.editor.objectKind = value as MapObjectKind;
      state.editor.lastMessage = 'Тип создаваемого предмета изменён.';
      renderEditorStatus(status, state, enabledButton, floatingButton, section);
    },
  );

  const unitTypeSelect = createSelect(
    UNIT_TYPE_OPTIONS,
    state.editor.unitType,
    (value) => {
      state.editor.unitType = value as UnitType;
      state.editor.lastMessage = 'Тип создаваемого юнита изменён.';
      renderEditorStatus(status, state, enabledButton, floatingButton, section);
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

  const applyObjectButton = createButton('Применить числа к выбранному предмету');
  applyObjectButton.addEventListener('click', () => {
    updateSelectedEditorObject(state, {
      widthCells: state.editor.objectWidthCells,
      heightCells: state.editor.objectHeightCells,
      rotationRadians: degreesToRadians(state.editor.objectRotationDegrees),
    });
    renderEditorStatus(status, state, enabledButton, floatingButton, section);
  });

  const quickControls = document.createElement('div');
  quickControls.style.display = 'grid';
  quickControls.style.gap = '6px';

  const moveRow = createButtonRow([
    ['←', () => nudgeSelectedEditorObject(state, -0.5, 0)],
    ['↑', () => nudgeSelectedEditorObject(state, 0, -0.5)],
    ['↓', () => nudgeSelectedEditorObject(state, 0, 0.5)],
    ['→', () => nudgeSelectedEditorObject(state, 0.5, 0)],
  ]);
  const sizeRow = createButtonRow([
    ['Ширина −', () => resizeSelectedEditorObject(state, -0.5, 0)],
    ['Ширина +', () => resizeSelectedEditorObject(state, 0.5, 0)],
    ['Высота −', () => resizeSelectedEditorObject(state, 0, -0.5)],
    ['Высота +', () => resizeSelectedEditorObject(state, 0, 0.5)],
  ]);
  const rotateRow = createButtonRow([
    ['⟲ 15°', () => rotateSelectedEditorObject(state, -15)],
    ['⟳ 15°', () => rotateSelectedEditorObject(state, 15)],
  ]);

  quickControls.append(moveRow, sizeRow, rotateRow);

  const deleteSelectedButton = createButton('Удалить выбранное');
  deleteSelectedButton.addEventListener('click', () => {
    deleteSelectedEditorTargets(state);
    renderEditorStatus(status, state, enabledButton, floatingButton, section);
  });

  const clearAllButton = createButton('Очистить всё');
  clearAllButton.style.background = '#5c1f1f';
  clearAllButton.style.color = '#fff2a8';
  clearAllButton.addEventListener('click', () => {
    if (window.confirm('Очистить все предметы и всех юнитов на карте?')) {
      clearEditorScene(state);
      renderEditorStatus(status, state, enabledButton, floatingButton, section);
    }
  });

  const status = document.createElement('pre');
  status.style.margin = '0';
  status.style.whiteSpace = 'pre-wrap';
  status.style.fontSize = '12px';
  status.style.lineHeight = '1.45';
  status.style.color = '#f6edcf';

  root.append(
    enabledButton,
    createSmallText('В режиме редактора игровой инспектор скрыт. Юниты не получают боевые приказы. Левый клик работает как редактор, правый клик на движение отключён.'),
    createGroupTitle('Слои'),
    layersPanel,
    createGroupTitle('Инструмент'),
    toolRow,
    createSmallText('В режиме “Выбрать / тянуть”: потяни предмет за тело, чтобы переместить; потяни квадратную ручку, чтобы изменить размер; потяни круглую ручку сверху, чтобы повернуть.'),
    createGroupTitle('Создание'),
    createLabeledControl('Тип предмета', objectKindSelect),
    createLabeledControl('Тип юнита', unitTypeSelect),
    createLabeledControl('Ширина нового предмета, клеток', widthInput),
    createLabeledControl('Высота нового предмета, клеток', heightInput),
    createLabeledControl('Поворот нового предмета, градусов', rotationInput),
    applyObjectButton,
    createGroupTitle('Точные кнопки выбранного предмета'),
    quickControls,
    deleteSelectedButton,
    clearAllButton,
    createGroupTitle('Состояние редактора'),
    status,
  );

  hud.appendChild(section);
  document.body.appendChild(floatingButton);
  syncInspectorVisibility(hud, state, section);
  renderEditorStatus(status, state, enabledButton, floatingButton, section);
  window.setInterval(() => {
    syncInspectorVisibility(hud, state, section);
    renderEditorStatus(status, state, enabledButton, floatingButton, section);
  }, 300);
}

function toggleEditorMode(
  hud: HTMLElement,
  state: SimulationState,
  section: HTMLDetailsElement,
  enabledButton: HTMLButtonElement,
  floatingButton: HTMLButtonElement,
  status: HTMLElement,
): void {
  state.editor.enabled = !state.editor.enabled;
  state.editor.panelOpen = state.editor.enabled;
  section.open = state.editor.enabled;
  state.editor.drag = null;
  state.editor.tool = 'select';
  state.editor.lastMessage = state.editor.enabled
    ? 'Редактор включён. Игровой инспектор скрыт. Можно тянуть предметы и ручки прямо на карте.'
    : 'Редактор выключен. Игровой инспектор снова виден.';
  syncInspectorVisibility(hud, state, section);
  renderEditorStatus(status, state, enabledButton, floatingButton, section);
}

function syncInspectorVisibility(hud: HTMLElement, state: SimulationState, editorSection: HTMLDetailsElement): void {
  for (const section of hud.querySelectorAll<HTMLElement>('.hud-section')) {
    const isEditorSection = section.classList.contains('editor-section');
    section.style.display = isEditorSection
      ? state.editor.enabled ? '' : 'none'
      : state.editor.enabled ? 'none' : '';
  }

  if (state.editor.enabled) {
    editorSection.open = true;
  }
}

function createFloatingEditorButton(): HTMLButtonElement {
  const button = createButton('Редактор');
  button.style.position = 'fixed';
  button.style.left = '16px';
  button.style.bottom = '16px';
  button.style.zIndex = '20';
  button.style.padding = '10px 14px';
  button.style.borderRadius = '10px';
  button.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.35)';
  return button;
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

function createButtonRow(items: Array<[string, () => void]>): HTMLElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '6px';

  for (const [label, action] of items) {
    const button = createButton(label);
    button.addEventListener('click', action);
    row.appendChild(button);
  }

  return row;
}

function createLayerToggle(label: string, value: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '8px';
  wrapper.style.color = '#f6edcf';
  wrapper.style.fontSize = '12px';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  wrapper.append(input, label);
  return wrapper;
}

function createSmallText(text: string): HTMLElement {
  const element = document.createElement('div');
  element.textContent = text;
  element.style.fontSize = '12px';
  element.style.color = '#f6edcf';
  return element;
}

function createGroupTitle(text: string): HTMLElement {
  const element = document.createElement('div');
  element.textContent = text;
  element.style.fontWeight = '700';
  element.style.fontSize = '12px';
  element.style.color = '#fff2a8';
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

  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  }

  select.value = value;
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

function renderEditorStatus(
  status: HTMLElement | null,
  state: SimulationState,
  enabledButton: HTMLButtonElement,
  floatingButton: HTMLButtonElement,
  section: HTMLDetailsElement,
): void {
  if (!status) {
    return;
  }

  const selectedObject = getSelectedMapObject(state);
  const selectedUnit = getSelectedUnit(state);
  const tool = TOOL_OPTIONS.find((option) => option.value === state.editor.tool);

  enabledButton.textContent = state.editor.enabled ? 'Редактор: вкл' : 'Редактор: выкл';
  floatingButton.textContent = state.editor.enabled ? 'Редактор: вкл' : 'Редактор';
  floatingButton.style.background = state.editor.enabled ? '#fff2a8' : '';
  floatingButton.style.color = state.editor.enabled ? '#121612' : '';
  state.editor.panelOpen = section.open;

  status.textContent = [
    `Состояние: ${state.editor.enabled ? 'включён' : 'выключен'}`,
    `Инструмент: ${tool?.label ?? state.editor.tool}`,
    `Слои: предметы ${state.editor.layers.objects ? 'видны' : 'скрыты'}, юниты ${state.editor.layers.units ? 'видны' : 'скрыты'}, зоны ${state.editor.layers.pressureZones ? 'видны' : 'скрыты'}`,
    `Предмет: ${selectedObject ? selectedObject.id : 'не выбран'}`,
    `Юнит: ${selectedUnit ? selectedUnit.id : 'не выбран'}`,
    `Размер нового предмета: ${state.editor.objectWidthCells}×${state.editor.objectHeightCells} клеток`,
    `Поворот нового предмета: ${state.editor.objectRotationDegrees}°`,
    `Сообщение: ${state.editor.lastMessage}`,
    '',
    'Как работает на карте:',
    '- клик по предмету выбирает его;',
    '- зажатая мышь по телу предмета двигает его;',
    '- зажатая мышь по квадратной ручке меняет размер;',
    '- зажатая мышь по круглой ручке сверху вращает предмет;',
    '- зажатая мышь по юниту двигает юнит;',
    '- отдельный инструмент “Переместить” больше не нужен.',
  ].join('\n');
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
