export const COMBAT_LAB_PRIMARY_WORKSPACE_TAB_DEFINITIONS = Object.freeze([
  { tabId: 'scene', labelRu: 'Карта', titleRu: 'Карта эксперимента' },
  { tabId: 'program', labelRu: 'Программа', titleRu: 'Программа эксперимента' },
  { tabId: 'laboratory', labelRu: 'Лаборатория', titleRu: 'Лаборатория' },
  { tabId: 'metrics', labelRu: 'Метрики', titleRu: 'Метрики текущего прогона' },
  { tabId: 'journal', labelRu: 'Журнал', titleRu: 'Журнал' },
  { tabId: 'batch', labelRu: 'Серия', titleRu: 'Серия прогонов' },
] as const);

export const COMBAT_LAB_AUXILIARY_WORKSPACE_TAB_DEFINITIONS = Object.freeze([
  { tabId: 'parameters', labelRu: 'Параметры', titleRu: 'Текущие параметры бойцов' },
  { tabId: 'settings', labelRu: 'Общие редакторы', titleRu: 'Общие редакторы игры' },
] as const);

export const COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS = Object.freeze([
  ...COMBAT_LAB_PRIMARY_WORKSPACE_TAB_DEFINITIONS,
  ...COMBAT_LAB_AUXILIARY_WORKSPACE_TAB_DEFINITIONS,
] as const);

export const POLYGON_RIGHT_PANEL_DEFINITIONS = Object.freeze([
  {
    tabId: 'unit',
    labelRu: 'Юнит',
    emptyRu: '',
  },
  {
    tabId: 'info',
    labelRu: 'Инфо',
    emptyRu: 'Инспектор точки карты ждёт подтверждённый продуктовый запрос. Каркас не вычисляет свойства мира самостоятельно.',
  },
  {
    tabId: 'attention',
    labelRu: 'Внимание',
    emptyRu: 'Вкладка ждёт данные внимания и восприятия, уже подготовленные симуляцией. Повторного расчёта видимости в интерфейсе нет.',
  },
  {
    tabId: 'memory',
    labelRu: 'Память',
    emptyRu: 'Вкладка ждёт подтверждённые субъективные данные памяти. Отсутствующие типы знаний не подменяются демонстрационными значениями.',
  },
] as const);

export type CombatLabWorkspaceTab = typeof COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS[number]['tabId'];
export type PolygonRightPanelTab = typeof POLYGON_RIGHT_PANEL_DEFINITIONS[number]['tabId'];

export interface CombatLabWorkspaceHosts {
  readonly scene: HTMLElement;
  readonly program: HTMLElement;
  readonly laboratory: HTMLElement;
  readonly metrics: HTMLElement;
  readonly journal: HTMLElement;
  readonly batch: HTMLElement;
  readonly parameters: HTMLElement;
  readonly settings: HTMLElement;
}

export interface CombatLabRightPanelHosts {
  readonly unit: HTMLElement;
  readonly info: HTMLElement;
  readonly attention: HTMLElement;
  readonly memory: HTMLElement;
}

export function isCombatLabWorkspaceTab(value: unknown): value is CombatLabWorkspaceTab {
  return typeof value === 'string'
    && COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS.some((definition) => definition.tabId === value);
}

export function normalizeCombatLabWorkspaceTab(value: unknown): CombatLabWorkspaceTab {
  return isCombatLabWorkspaceTab(value) ? value : 'scene';
}

export function isPolygonRightPanelTab(value: unknown): value is PolygonRightPanelTab {
  return typeof value === 'string'
    && POLYGON_RIGHT_PANEL_DEFINITIONS.some((definition) => definition.tabId === value);
}

export function normalizePolygonRightPanelTab(value: unknown): PolygonRightPanelTab {
  return isPolygonRightPanelTab(value) ? value : 'unit';
}
