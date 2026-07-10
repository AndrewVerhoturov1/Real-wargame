import type { SoldierAwarenessMode } from '../knowledge/SoldierAwarenessGrid';
import { selectUnit, type SimulationState } from '../simulation/SimulationState';

export type AiLabTool = 'select' | 'place_fighter' | 'place_threat' | 'place_cover' | 'delete';
export type AiLabPanel = 'fighter' | 'threat' | 'cover' | 'awareness';
export type AiLabThreatHandle =
  | 'move'
  | 'direction'
  | 'range'
  | 'arc_left'
  | 'arc_right'
  | 'min_range'
  | 'radius'
  | 'rect_width'
  | 'rect_height'
  | 'rect_rotate';

export interface AiLabDragState {
  kind: 'unit' | 'object' | 'threat';
  id: string;
  handle: AiLabThreatHandle | 'move';
  startGrid: { x: number; y: number };
  snapshot: Record<string, number>;
}

export interface AiLabRuntime {
  open: boolean;
  tool: AiLabTool;
  activePanel: AiLabPanel;
  awarenessMode: SoldierAwarenessMode;
  repeatPlacement: boolean;
  hoveredHandle: AiLabThreatHandle | null;
  drag: AiLabDragState | null;
  status: string;
}

const runtimes = new WeakMap<SimulationState, AiLabRuntime>();

export function getAiLabRuntime(state: SimulationState): AiLabRuntime {
  let runtime = runtimes.get(state);
  if (!runtime) {
    runtime = {
      open: false,
      tool: 'select',
      activePanel: 'fighter',
      awarenessMode: 'off',
      repeatPlacement: true,
      hoveredHandle: null,
      drag: null,
      status: 'Полигон закрыт.',
    };
    runtimes.set(state, runtime);
  }
  return runtime;
}

export function setAiLabOpen(state: SimulationState, open: boolean): void {
  const runtime = getAiLabRuntime(state);
  runtime.open = open;
  runtime.drag = null;
  runtime.hoveredHandle = null;
  runtime.tool = open ? runtime.tool : 'select';
  runtime.status = open ? 'Полигон открыт. Выберите инструмент.' : 'Полигон закрыт.';
}

export function setAiLabTool(state: SimulationState, tool: AiLabTool): void {
  const runtime = getAiLabRuntime(state);
  runtime.tool = tool;
  runtime.drag = null;
  runtime.hoveredHandle = null;
  if (tool === 'place_fighter') runtime.activePanel = 'fighter';
  if (tool === 'place_threat') runtime.activePanel = 'threat';
  if (tool === 'place_cover') runtime.activePanel = 'cover';
  runtime.status = toolStatus(tool);
}

export function setAiLabPanel(state: SimulationState, panel: AiLabPanel): void {
  const runtime = getAiLabRuntime(state);
  runtime.activePanel = panel;
  if (panel === 'awareness' && runtime.awarenessMode === 'off') runtime.awarenessMode = 'all';
}

export function setAwarenessMode(state: SimulationState, mode: SoldierAwarenessMode): void {
  const runtime = getAiLabRuntime(state);
  runtime.awarenessMode = mode;
  runtime.activePanel = 'awareness';
  runtime.status = mode === 'off' ? 'Карта бойца скрыта.' : `Карта бойца: ${awarenessLabel(mode)}.`;
}

export function setAiLabStatus(state: SimulationState, status: string): void {
  getAiLabRuntime(state).status = status;
}

export function duplicateSelectedLabEntity(state: SimulationState): boolean {
  const runtime = getAiLabRuntime(state);
  const unit = state.selectedUnitId ? state.units.find((item) => item.id === state.selectedUnitId) : undefined;
  if (unit && runtime.activePanel === 'fighter') {
    const index = state.editor.nextUnitIndex++;
    const clone = deepClone(unit);
    clone.id = `editor_unit_${index}`;
    clone.labels = { en: `${unit.labels.en} copy`, ru: `${unit.labels.ru} копия` };
    clone.position = { x: Math.min(state.map.width - 0.5, unit.position.x + 1), y: Math.min(state.map.height - 0.5, unit.position.y + 1) };
    clone.order = null;
    clone.tacticalKnowledge.revision += 1;
    state.units.push(clone);
    selectUnit(state, clone.id);
    runtime.status = `Создана копия бойца: ${clone.labels.ru}.`;
    return true;
  }

  const zone = state.editor.selectedZoneId
    ? state.pressureZones.find((item) => item.id === state.editor.selectedZoneId)
    : undefined;
  if (zone && runtime.activePanel === 'threat') {
    const index = state.editor.nextZoneIndex++;
    const clone = deepClone(zone);
    clone.id = `editor_zone_${index}`;
    clone.labels = { en: `${zone.labels.en} copy`, ru: `${zone.labels.ru} копия` };
    clone.x = Math.min(state.map.width - 0.5, zone.x + 1);
    clone.y = Math.min(state.map.height - 0.5, zone.y + 1);
    state.pressureZones.push(clone);
    state.editor.selectedZoneId = clone.id;
    runtime.status = `Создана копия угрозы: ${clone.labels.ru}.`;
    return true;
  }

  const object = state.editor.selectedObjectId
    ? state.map.objects.find((item) => item.id === state.editor.selectedObjectId)
    : undefined;
  if (object && runtime.activePanel === 'cover') {
    const index = state.editor.nextObjectIndex++;
    const clone = deepClone(object);
    clone.id = `editor_object_${index}`;
    clone.labels = { en: `${object.labels?.en ?? object.kind} copy`, ru: `${object.labels?.ru ?? object.kind} копия` };
    clone.x = Math.min(state.map.width - clone.widthCells, object.x + 1);
    clone.y = Math.min(state.map.height - clone.heightCells, object.y + 1);
    state.map.objects.push(clone);
    state.editor.selectedObjectId = clone.id;
    runtime.status = `Создана копия укрытия: ${clone.labels.ru}.`;
    return true;
  }

  runtime.status = 'Сначала выберите нужную вкладку и объект.';
  return false;
}

export function clearAiLabSelection(state: SimulationState): void {
  selectUnit(state, null);
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  getAiLabRuntime(state).drag = null;
}

function toolStatus(tool: AiLabTool): string {
  if (tool === 'place_fighter') return 'Инструмент: разместить бойца. Щёлкните по карте.';
  if (tool === 'place_threat') return 'Инструмент: разместить угрозу. Щёлкните по карте.';
  if (tool === 'place_cover') return 'Инструмент: разместить укрытие. Щёлкните по карте.';
  if (tool === 'delete') return 'Инструмент: удалить. Щёлкните по объекту.';
  return 'Инструмент: выбрать и перетаскивать.';
}

function awarenessLabel(mode: SoldierAwarenessMode): string {
  const labels: Record<SoldierAwarenessMode, string> = {
    off: 'выключена',
    all: 'всё восприятие',
    danger: 'угрозы',
    cover: 'защита',
    safe: 'безопасные позиции',
    uncertainty: 'неопределённость',
    objective: 'объективная карта',
  };
  return labels[mode];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
