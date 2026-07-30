export const COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS = Object.freeze([
  { tabId: 'scene', labelRu: 'Сцена', titleRu: 'Начальная сцена' },
  { tabId: 'program', labelRu: 'Программа', titleRu: 'Программа эксперимента' },
  { tabId: 'batch', labelRu: 'Серия', titleRu: 'Серия прогонов' },
  { tabId: 'parameters', labelRu: 'Параметры', titleRu: 'Параметры бойцов' },
  { tabId: 'metrics', labelRu: 'Метрики', titleRu: 'Метрики текущего прогона' },
  { tabId: 'journal', labelRu: 'Журнал', titleRu: 'Журнал' },
] as const);

export type CombatLabWorkspaceTab = typeof COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS[number]['tabId'];

export interface CombatLabWorkspaceHosts {
  readonly scene: HTMLElement;
  readonly program: HTMLElement;
  readonly batch: HTMLElement;
  readonly parameters: HTMLElement;
  readonly metrics: HTMLElement;
  readonly journal: HTMLElement;
}

export function isCombatLabWorkspaceTab(value: unknown): value is CombatLabWorkspaceTab {
  return typeof value === 'string'
    && COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS.some((definition) => definition.tabId === value);
}

export function normalizeCombatLabWorkspaceTab(value: unknown): CombatLabWorkspaceTab {
  return isCombatLabWorkspaceTab(value) ? value : 'scene';
}
