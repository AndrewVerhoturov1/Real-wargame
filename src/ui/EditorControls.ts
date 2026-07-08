import type { MapObjectKind } from '../core/map/MapModel';
import type { PressureZoneShape } from '../core/pressure/PressureZone';
import {
  clearEditorScene,
  deleteSelectedEditorTargets,
  getSelectedMapObject,
  getSelectedPressureZone,
  getSelectedUnit,
  nudgeSelectedEditorObject,
  nudgeSelectedEditorZone,
  resizeSelectedEditorObject,
  rotateSelectedEditorObject,
  type EditorTool,
  type SimulationState,
  updateSelectedEditorObject,
  updateSelectedEditorZone,
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

const ZONE_SHAPE_OPTIONS: Array<{ value: PressureZoneShape; label: string }> = [
  { value: 'circle', label: 'Круг' },
  { value: 'rect', label: 'Прямоугольник' },
];

const TOOL_OPTIONS: Array<{ value: EditorTool; label: string; hint: string }> = [
  { value: 'select', label: 'Выбрать / тянуть', hint: 'клик выбирает, зажатая мышь двигает, ручки меняют размер и поворот' },
  { value: 'spawn_object', label: 'Создать предмет', hint: 'клик по карте создаёт предмет' },
  { value: 'spawn_unit', label: 'Создать юнит', hint: 'клик по карте создаёт юнит' },
  { value: 'spawn_zone', label: 'Создать зону', hint: 'клик по карте создаёт зону параметров' },
  { value: 'delete', label: 'Удалить', hint: 'клик по предмету, юниту или зоне удаляет его' },
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
  const section = createSection('Редактор карты', root, false);

  const status = document.createElement('pre');
  status.className = 'editor-status-block';
  status.style.margin = '0';
  status.style.whiteSpace = 'pre-wrap';
  status.style.fontSize = '12px';
  status.style.lineHeight = '1.45';
  status.style.color = '#f6edcf';

  enabledButton.addEventListener('click', () => toggleEditorMode(hud, state, section, enabledButton, floatingButton, status));
  floatingButton.addEventListener('click', () => toggleEditorMode(hud, state, section, enabledButton, floatingButton, status));

  const toolRow = document.createElement('div');
  toolRow.className = 'editor-tool-row';

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
  layersPanel.className = 'editor-layers-panel';
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
      if (!checked) {
        state.editor.selectedZoneId = null;
      }
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

  const zoneShapeSelect = createSelect(
    ZONE_SHAPE_OPTIONS,
    state.editor.zoneShape,
    (value) => {
      state.editor.zoneShape = value as PressureZoneShape;
      state.editor.lastMessage = 'Форма создаваемой зоны изменена.';
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

  const zoneRadiusInput = createNumberInput(state.editor.zoneRadiusCells, 0.5, 30, 0.5, (value) => {
    state.editor.zoneRadiusCells = value;
  });
  const zoneWidthInput = createNumberInput(state.editor.zoneWidthCells, 0.5, 40, 0.5, (value) => {
    state.editor.zoneWidthCells = value;
  });
  const zoneHeightInput = createNumberInput(state.editor.zoneHeightCells, 0.5, 40, 0.5, (value) => {
    state.editor.zoneHeightCells = value;
  });
  const zoneStrengthInput = createNumberInput(state.editor.zoneStrength, 0, 100, 5, (value) => {
    state.editor.zoneStrength = value;
  });
  const zoneStressInput = createNumberInput(state.editor.zoneStressPerSecond, 0, 100, 1, (value) => {
    state.editor.zoneStressPerSecond = value;
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

  const applyZoneButton = createButton('Применить числа к выбранной зоне');
  applyZoneButton.addEventListener('click', () => {
    updateSelectedEditorZone(state, {
      shape: state.editor.zoneShape,
      radiusCells: state.editor.zoneRadiusCells,
      widthCells: state.editor.zoneWidthCells,
      heightCells: state.editor.zoneHeightCells,
      strength: state.editor.zoneStrength,
      stressPerSecond: state.editor.zoneStressPerSecond,
    });
    renderEditorStatus(status, state, enabledButton, floatingButton, section);
  });

  const objectQuickControls = document.createElement('div');
  objectQuickControls.className = 'editor-quick-controls';

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

  objectQuickControls.append(moveRow, sizeRow, rotateRow);

  const zoneMoveRow = createButtonRow([
    ['← зона', () => nudgeSelectedEditorZone(state, -0.5, 0)],
    ['↑ зона', () => nudgeSelectedEditorZone(state, 0, -0.5)],
    ['↓ зона', () => nudgeSelectedEditorZone(state, 0, 0.5)],
    ['→ зона', () => nudgeSelectedEditorZone(state, 0.5, 0)],
  ]);

  const deleteSelectedButton = createButton('Удалить выбранное');
  deleteSelectedButton.addEventListener('click', () => {
    deleteSelectedEditorTargets(state);
    renderEditorStatus(status, state, enabledButton, floatingButton, section);
  });

  const clearAllButton = createButton('Очистить всё');
  clearAllButton.className = 'danger-button';
  clearAllButton.addEventListener('click', () => {
    if (window.confirm('Очистить все предметы, всех юнитов и все зоны на карте?')) {
      clearEditorScene(state);
      renderEditorStatus(status, state, enabledButton, floatingButton, section);
    }
  });

  root.append(
    enabledButton,
    createSmallText('Редактор — отдельный рабочий режим. Игровые панели скрываются, карта остаётся в центре.'),
    createGroupTitle('Слои'),
    layersPanel,
    createGroupTitle('Инструмент'),
    toolRow,
    createGroupTitle('Создание предмета'),
    createLabeledControl('Тип предмета', objectKindSelect),
    createLabeledControl('Тип юнита', unitTypeSelect),
    createLabeledControl('Ширина нового предмета, клеток', widthInput),
    createLabeledControl('Высота нового предмета, клеток', heightInput),
    createLabeledControl('Поворот нового предмета, градусов', rotationInput),
    applyObjectButton,
    createGroupTitle('Создание зоны'),
    createLabeledControl('Форма зоны', zoneShapeSelect),
    createLabeledControl('Радиус круглой зоны, клеток', zoneRadiusInput),
    createLabeledControl('Ширина прямоугольной зоны, клеток', zoneWidthInput),
    createLabeledControl('Высота прямоугольной зоны, клеток', zoneHeightInput),
    createLabeledControl('Опасность зоны, 0–100', zoneStrengthInput),
    createLabeledControl('Стресс зоны в секунду', zoneStressInput),
    applyZoneButton,
    createGroupTitle('Точные кнопки выбранного предмета'),
    objectQuickControls,
    createGroupTitle('Точные кнопки выбранной зоны'),
    zoneMoveRow,
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
    ? 'Редактор включён. Игровые панели скрыты. Можно редактировать карту.'
    : 'Редактор выключен. Игровой интерфейс снова виден.';
  syncInspectorVisibility(hud, state, section);
  renderEditorStatus(status, state, enabledButton, floatingButton, section);
}

function syncInspectorVisibility(hud: HTMLElement, state: SimulationState, editorSection: HTMLDetailsElement): void {
  document.body.classList.toggle('editor-mode', state.editor.enabled);

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
  button.className = 'floating-editor-button';
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
  row.className = 'editor-button-row';

  for (const [label, action] of items) {
    const button = createButton(label);
    button.addEventListener('click', action);
    row.appendChild(button);
  }

  return row;
}

function createLayerToggle(label: string, value: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'editor-layer-toggle';

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
  element.className = 'editor-help-text';
  return element;
}

function createGroupTitle(text: string): HTMLElement {
  const element = document.createElement('div');
  element.textContent = text;
  element.className = 'editor-group-title';
  return element;
}

function createLabeledControl(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'editor-labeled-control';
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
  const selectedZone = getSelectedPressureZone(state);
  const tool = TOOL_OPTIONS.find((option) => option.value === state.editor.tool);

  enabledButton.textContent = state.editor.enabled ? 'Редактор: вкл' : 'Редактор: выкл';
  floatingButton.textContent = state.editor.enabled ? 'Закрыть редактор' : 'Редактор';
  floatingButton.classList.toggle('active', state.editor.enabled);
  state.editor.panelOpen = section.open;

  status.textContent = [
    `Состояние: ${state.editor.enabled ? 'включён' : 'выключен'}`,
    `Инструмент: ${tool?.label ?? state.editor.tool}`,
    `Слои: предметы ${state.editor.layers.objects ? 'видны' : 'скрыты'}, юниты ${state.editor.layers.units ? 'видны' : 'скрыты'}, зоны ${state.editor.layers.pressureZones ? 'видны' : 'скрыты'}`,
    `Предмет: ${selectedObject ? selectedObject.id : 'не выбран'}`,
    `Юнит: ${selectedUnit ? selectedUnit.id : 'не выбран'}`,
    `Зона: ${selectedZone ? selectedZone.id : 'не выбрана'}`,
    `Размер нового предмета: ${state.editor.objectWidthCells}×${state.editor.objectHeightCells} клеток`,
    `Поворот нового предмета: ${state.editor.objectRotationDegrees}°`,
    `Новая зона: ${state.editor.zoneShape === 'circle' ? 'круг' : 'прямоугольник'}, опасность ${state.editor.zoneStrength}, стресс ${state.editor.zoneStressPerSecond}/сек`,
    `Сообщение: ${state.editor.lastMessage}`,
  ].join('\n');
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
