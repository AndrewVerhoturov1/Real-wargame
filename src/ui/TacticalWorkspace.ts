import type { AiGameBridgeHandle } from '../core/ai/AiGameBridge';
import type { SimulationState } from '../core/simulation/SimulationState';
import {
  installTacticalWorkspace as installTacticalWorkspaceBase,
} from './TacticalWorkspaceBase';

export * from './TacticalWorkspaceBase';

/**
 * Compatibility shell around the existing workspace while the danger tab is
 * migrated to the field-owned tactical-position UI. Observation is scoped to
 * one workspace subtree and coalesced to at most one cleanup per animation frame.
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
  const shell = document.querySelector<HTMLElement>('.tactical-workspace-shell');
  let cleaning = false;
  let scheduledFrame = 0;
  const cleanRemovedCoverUi = (): void => {
    if (!shell || cleaning) return;
    cleaning = true;
    try {
      shell.querySelectorAll<HTMLElement>('.cover-map-tooltip, .selected-cover-card').forEach((element) => element.remove());
      shell.querySelectorAll<HTMLElement>('.workspace-panel-section').forEach((section) => {
        const title = section.querySelector('h3')?.textContent?.trim() ?? '';
        if (title === 'Известные укрытия' || title === 'Известные предметы и укрытия') section.remove();
      });
      shell.querySelectorAll<HTMLElement>('.workspace-info-grid > div').forEach((row) => {
        const label = row.querySelector('span')?.textContent?.trim() ?? '';
        if (label === 'Известных укрытий') row.remove();
      });
      const sidebarTitle = shell.querySelector<HTMLElement>('[data-role="sidebar-title"]');
      if (sidebarTitle?.textContent === 'Опасность и укрытия') sidebarTitle.textContent = 'Опасность и тактические позиции';
      const sidebarBody = shell.querySelector<HTMLElement>('[data-role="sidebar-body"]');
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
  const scheduleCleanup = (): void => {
    if (scheduledFrame !== 0) return;
    scheduledFrame = window.requestAnimationFrame(() => {
      scheduledFrame = 0;
      cleanRemovedCoverUi();
    });
  };

  const observer = shell ? new MutationObserver(scheduleCleanup) : null;
  observer?.observe(shell, { childList: true, subtree: true });
  cleanRemovedCoverUi();

  return () => {
    observer?.disconnect();
    if (scheduledFrame !== 0) window.cancelAnimationFrame(scheduledFrame);
    style.remove();
    teardownBase();
  };
}
