import type { SimulationState } from '../../core/simulation/SimulationState';
import {
  getCombatLabWorkspaceServices,
  type CombatLabWorkspaceServices,
} from '../CombatLabWorkspaceServices';
import {
  COMBAT_LAB_ACTIVATE_RIGHT_PANEL_EVENT,
  type PolygonRightPanelTab,
} from './CombatLabWorkspaceTabs';

export type CombatLabRightPanelTab = PolygonRightPanelTab;

export interface CombatLabRightPanelHosts {
  readonly unit: HTMLElement;
  readonly info: HTMLElement;
  readonly attention: HTMLElement;
  readonly memory: HTMLElement;
}

export interface CombatLabRightPanelHeaderV1 {
  readonly kickerRu: string;
  readonly titleRu: string;
}

export interface CombatLabRightPanelSeamV1 {
  readonly state: SimulationState;
  readonly selection: CombatLabWorkspaceServices['selection'];
  readonly hosts: CombatLabRightPanelHosts;
  isTabActive(tabId: CombatLabRightPanelTab): boolean;
  activateTab(tabId: CombatLabRightPanelTab): void;
  setHeader(header: CombatLabRightPanelHeaderV1): void;
}

const RIGHT_PANEL_TABS: readonly CombatLabRightPanelTab[] = Object.freeze([
  'unit',
  'info',
  'attention',
  'memory',
]);

export function getCombatLabRightPanelSeam(
  workspaceRoot: HTMLElement,
  state: SimulationState,
): CombatLabRightPanelSeamV1 {
  const rightPanel = requiredElement<HTMLElement>(
    workspaceRoot,
    '#polygon-shell-right-panel',
    'Не найдена правая панель Полигона.',
  );
  const kicker = requiredElement<HTMLElement>(
    rightPanel,
    '.polygon-shell-panel-kicker',
    'Не найден заголовок-категория правой панели Полигона.',
  );
  const title = requiredElement<HTMLElement>(
    rightPanel,
    '.polygon-shell-panel-title',
    'Не найден заголовок выбранного объекта правой панели Полигона.',
  );

  const mutableHosts = {} as Record<CombatLabRightPanelTab, HTMLElement>;
  for (const tabId of RIGHT_PANEL_TABS) {
    mutableHosts[tabId] = requiredElement<HTMLElement>(
      rightPanel,
      `[data-polygon-right-panel="${tabId}"]`,
      `Не найден host правой панели Полигона: ${tabId}.`,
    );
  }

  const services = getCombatLabWorkspaceServices(workspaceRoot);
  const hosts = Object.freeze(mutableHosts) as CombatLabRightPanelHosts;
  return Object.freeze({
    state,
    selection: services.selection,
    hosts,
    isTabActive: (tabId: CombatLabRightPanelTab) => !hosts[tabId].hidden,
    activateTab: (tabId: CombatLabRightPanelTab) => {
      workspaceRoot.dispatchEvent(new CustomEvent<CombatLabRightPanelTab>(
        COMBAT_LAB_ACTIVATE_RIGHT_PANEL_EVENT,
        { bubbles: true, detail: tabId },
      ));
    },
    setHeader: (header: CombatLabRightPanelHeaderV1) => {
      kicker.textContent = header.kickerRu;
      title.textContent = header.titleRu;
    },
  });
}

function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
  messageRu: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(messageRu);
  return element;
}
