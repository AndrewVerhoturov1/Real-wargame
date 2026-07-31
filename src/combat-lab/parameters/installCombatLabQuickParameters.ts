import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';
import { getCombatLabWorkspaceServices } from '../CombatLabWorkspaceServices';
import { CombatLabQuickParametersPanel } from '../ui/CombatLabQuickParametersPanel';

export interface CombatLabQuickParametersInstallationV1 {
  destroy(): void;
}

export function installCombatLabQuickParameters(
  extensionRoot: HTMLElement,
  session: CombatLabVisualSession,
): CombatLabQuickParametersInstallationV1 {
  const workspaceRoot = extensionRoot.querySelector<HTMLElement>('.combat-lab-workspace');
  const host = extensionRoot.querySelector<HTMLElement>('[data-combat-lab-parameters-host="selected-unit"]');
  const programHost = extensionRoot.querySelector<HTMLElement>('.combat-lab-stage10-program-host');
  if (!workspaceRoot || !host) throw new Error('Не найдена foundation-точка подключения быстрых параметров.');
  const services = getCombatLabWorkspaceServices(workspaceRoot);
  const isActive = (): boolean => {
    const panel = extensionRoot.querySelector<HTMLElement>('[data-combat-lab-tab-panel="parameters"]');
    return panel !== null && !panel.hidden;
  };
  const isLocked = (): boolean => programHost?.inert === true;
  const panel = CombatLabQuickParametersPanel.create({
    host,
    services,
    isActive,
    isLocked,
    getRuntimeSnapshot: () => null,
    getVisualSnapshot: () => session.getSnapshot(),
    onApplyAndRerun: (_seed) => {
      extensionRoot.dispatchEvent(new CustomEvent('combat-lab:set-paused', { detail: false }));
    },
    onRequestMapSelection: () => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas');
      canvas?.focus();
      const status = extensionRoot.querySelector<HTMLElement>('.combat-lab-dock-status');
      if (status) status.textContent = 'Выберите бойца щелчком на карте.';
    },
  });
  const handleTabChange = (): void => {
    if (!isActive()) return;
    panel.acceptExperiment();
    panel.setLocked(isLocked());
    panel.refresh();
  };
  workspaceRoot.addEventListener('combat-lab-workspace-tab-change', handleTabChange);
  const lockObserver = programHost
    ? new MutationObserver(() => panel.setLocked(isLocked()))
    : null;
  if (programHost) lockObserver?.observe(programHost, { attributes: true, attributeFilter: ['aria-disabled', 'inert'] });
  handleTabChange();
  let destroyed = false;
  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      lockObserver?.disconnect();
      workspaceRoot.removeEventListener('combat-lab-workspace-tab-change', handleTabChange);
      panel.destroy();
    },
  };
}
