import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';
import type { SimulationState } from '../core/simulation/SimulationState';
import {
  installTacticalWorkspace as installTacticalWorkspaceBase,
} from './TacticalWorkspaceBase';

export * from './TacticalWorkspaceBase';

/**
 * Compatibility shell around the existing workspace while the danger tab is
 * migrated to the field-owned tactical-position UI. The removed object-cover
 * list and tooltip are stripped synchronously whenever the base panel updates.
 */
export function installTacticalWorkspace(
  state: SimulationState,
  aiBridge: AiGameBridgeHandle,
  onChanged: () => void,
): () => void {
  const style = document.createElement('style');
  style.dataset.tacticalPositionMigration = 'true';
  style.textContent = `
    .cover-map-tooltip,
    .selected-cover-card,
    .workspace-panel-section:has([data-role="cover-list"]) {
      display: none !important;
    }
  `;
  document.head.append(style);

  const teardownBase = installTacticalWorkspaceBase(state, aiBridge, onChanged);
  let cleaning = false;
  const cleanRemovedCoverUi = (): void => {
    if (cleaning) return;
    cleaning = true;
    try {
      document.querySelectorAll<HTMLElement>('.cover-map-tooltip, .selected-cover-card').forEach((element) => element.remove());
      document.querySelectorAll<HTMLElement>('.workspace-panel-section').forEach((section) => {
        const title = section.querySelector('h3')?.textContent?.trim() ?? '';
        if (title === 'Известные укрытия' || title === 'Известные предметы и укрытия') section.remove();
      });
      document.querySelectorAll<HTMLElement>('.workspace-info-grid > div').forEach((row) => {
        const label = row.querySelector('span')?.textContent?.trim() ?? '';
        if (label === 'Известных укрытий') row.remove();
      });
      const sidebarTitle = document.querySelector<HTMLElement>('[data-role="sidebar-title"]');
      if (sidebarTitle?.textContent === 'Опасность и укрытия') sidebarTitle.textContent = 'Опасность и тактические позиции';
      const sidebarBody = document.querySelector<HTMLElement>('[data-role="sidebar-body"]');
      if (
        sidebarTitle?.textContent === 'Опасность и тактические позиции'
        && sidebarBody
        && !sidebarBody.querySelector('[data-role="tactical-position-help"]')
      ) {
        const help = document.createElement('section');
        help.className = 'workspace-panel-section';
        help.dataset.role = 'tactical-position-help';
        help.innerHTML = '<h3>Тактические позиции</h3><p>Ромбы на карте рассчитаны из личного поля опасности бойца. Полосы внутри ромба показывают рекомендуемую позу: стоя, пригнувшись или лёжа.</p>';
        sidebarBody.append(help);
      }
    } finally {
      cleaning = false;
    }
  };

  const observer = new MutationObserver(cleanRemovedCoverUi);
  observer.observe(document.body, { childList: true, subtree: true });
  cleanRemovedCoverUi();

  return () => {
    observer.disconnect();
    style.remove();
    teardownBase();
  };
}
