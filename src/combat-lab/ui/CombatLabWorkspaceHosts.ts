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

export type CombatLabWorkspaceTab = typeof COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS[number]['tabId'];

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

export function isCombatLabWorkspaceTab(value: unknown): value is CombatLabWorkspaceTab {
  return typeof value === 'string'
    && COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS.some((definition) => definition.tabId === value);
}

export function normalizeCombatLabWorkspaceTab(value: unknown): CombatLabWorkspaceTab {
  return isCombatLabWorkspaceTab(value) ? value : 'scene';
}
