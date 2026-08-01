import type { GameEditorOpenRequest } from '../../game-editors/GameEditorTypes';
import {
  requestCombatLabGameEditorOpen,
  resolveCombatLabSelectedUnitProfileLinks,
} from '../game-editors/CombatLabGameEditorLinks';
import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';
import { requestCombatLabResetAndStart } from '../runtime/CombatLabResetAndStart';
import { getCombatLabWorkspaceServices } from '../CombatLabWorkspaceServices';
import { CombatLabQuickParametersPanel } from '../ui/CombatLabQuickParametersPanel';
import {
  getCombatLabWorkspaceHosts,
  getOnlyCombatLabWorkspaceRoot,
} from '../ui/CombatLabWorkspaceTabs';

export interface CombatLabQuickParametersInstallationV1 {
  destroy(): void;
}

export function installCombatLabQuickParameters(
  extensionRoot: HTMLElement,
  session: CombatLabVisualSession,
): CombatLabQuickParametersInstallationV1 {
  const workspaceRoot = getOnlyCombatLabWorkspaceRoot();
  const workspaceHosts = getCombatLabWorkspaceHosts(workspaceRoot);
  const host = workspaceHosts.parameters;
  const installationRoot = document.createElement('section');
  installationRoot.className = 'combat-lab-quick-parameters-installation';
  const sourceProfilesHost = document.createElement('div');
  sourceProfilesHost.className = 'combat-lab-source-profile-links-host';
  const quickParametersHost = document.createElement('div');
  quickParametersHost.className = 'combat-lab-quick-parameters-host';
  installationRoot.append(sourceProfilesHost, quickParametersHost);
  const manualDivider = host.querySelector<HTMLElement>('.combat-lab-workspace-divider');
  if (manualDivider) host.insertBefore(installationRoot, manualDivider);
  else host.append(installationRoot);

  const programHost = workspaceHosts.program.querySelector<HTMLElement>('.combat-lab-stage10-program-host');
  const services = getCombatLabWorkspaceServices(workspaceRoot);
  const profileButtonListeners: Array<readonly [HTMLButtonElement, EventListener]> = [];
  const isActive = (): boolean => {
    const panel = extensionRoot.querySelector<HTMLElement>('[data-combat-lab-tab-panel="parameters"]');
    return panel !== null && !panel.hidden;
  };
  const isLocked = (): boolean => programHost?.inert === true;
  const onOpenSourceProfile = (
    request: GameEditorOpenRequest,
    trigger: HTMLElement,
  ): void => requestCombatLabGameEditorOpen(extensionRoot, request, trigger);

  const panel = CombatLabQuickParametersPanel.create({
    host: quickParametersHost,
    services,
    isActive,
    isLocked,
    getRuntimeSnapshot: () => null,
    getVisualSnapshot: () => session.getSnapshot(),
    onResetAndStart: (seed) => {
      requestCombatLabResetAndStart(extensionRoot, seed);
    },
    onRequestMapSelection: () => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas');
      canvas?.focus();
      const status = extensionRoot.querySelector<HTMLElement>('.combat-lab-dock-status');
      if (status) status.textContent = 'Выберите бойца щелчком на карте.';
    },
  });

  const renderSourceProfiles = (): void => {
    for (const [button, listener] of profileButtonListeners) button.removeEventListener('click', listener);
    profileButtonListeners.length = 0;
    const selection = services.selection.get();
    if (selection.kind !== 'participant') {
      sourceProfilesHost.replaceChildren();
      return;
    }

    let context;
    try {
      context = services.participantMutations.get(selection.roleId);
    } catch {
      sourceProfilesHost.replaceChildren();
      return;
    }
    const links = resolveCombatLabSelectedUnitProfileLinks(context.unit);

    const section = document.createElement('section');
    section.className = 'combat-lab-source-profile-links';
    const heading = document.createElement('h3');
    heading.className = 'combat-lab-workspace-subheading';
    heading.textContent = 'Исходные общие профили';
    section.append(heading);
    for (const link of links) {
      const row = document.createElement('div');
      row.className = 'combat-lab-source-profile-link';
      const label = document.createElement('span');
      label.className = 'combat-lab-source-profile-link-name';
      label.textContent = link.profileId
        ? `${link.labelRu}: ${link.profileId}`
        : `${link.labelRu}: не указан — редактор откроет текущий профиль`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Открыть профиль';
      const listener: EventListener = () => onOpenSourceProfile({
        editorId: link.editorId,
        ...(link.profileId ? { profileId: link.profileId } : {}),
        selectedUnitId: context.unit.id,
        returnTo: '/combat-lab.html?tab=parameters',
      }, button);
      button.addEventListener('click', listener);
      profileButtonListeners.push([button, listener]);
      row.append(label, button);
      section.append(row);
    }
    sourceProfilesHost.replaceChildren(section);
  };

  const handleTabChange = (): void => {
    if (!isActive()) return;
    panel.acceptExperiment();
    panel.setLocked(isLocked());
    panel.refresh();
    renderSourceProfiles();
  };
  workspaceRoot.addEventListener('combat-lab-workspace-tab-change', handleTabChange);
  const unsubscribeSelection = services.selection.subscribe(() => renderSourceProfiles());
  const unsubscribeDraft = services.draft.subscribe(() => renderSourceProfiles());
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
      unsubscribeSelection();
      unsubscribeDraft();
      for (const [button, listener] of profileButtonListeners) button.removeEventListener('click', listener);
      profileButtonListeners.length = 0;
      workspaceRoot.removeEventListener('combat-lab-workspace-tab-change', handleTabChange);
      panel.destroy();
      installationRoot.remove();
    },
  };
}
