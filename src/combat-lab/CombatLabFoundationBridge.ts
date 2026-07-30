import type { CombatLabExperimentV1 } from '../core/testing/combat-lab/experiment';
import type { GameApplicationContext, GameApplicationExtension } from '../game/GameApplicationTypes';
import { CombatLabExtension } from './CombatLabExtension';
import {
  CombatLabWorkspaceServices,
  registerCombatLabWorkspaceServices,
} from './CombatLabWorkspaceServices';
import type { CombatLabExperimentDraft } from './scenario-editor/CombatLabExperimentDraft';
import type { CombatLabVisualSession } from './runtime/CombatLabVisualSession';

interface CombatLabExtensionFoundationInternals {
  readonly draft: CombatLabExperimentDraft;
  handleExperimentChanged(experiment: CombatLabExperimentV1, source: 'editor' | 'external'): void;
}

export function createCombatLabFoundationExtension(
  root: HTMLElement,
  session: CombatLabVisualSession,
  context: GameApplicationContext,
): GameApplicationExtension {
  const extension = CombatLabExtension.create(root, session, context);
  const internals = extension as unknown as CombatLabExtensionFoundationInternals;
  if (!internals.draft || typeof internals.handleExperimentChanged !== 'function') {
    extension.destroy();
    throw new Error('Combat Lab не предоставил foundation-точку подключения общих служб.');
  }

  const programHost = root.querySelector<HTMLElement>('.combat-lab-stage10-program-host');
  const mapModeStatus = programHost?.nextElementSibling instanceof HTMLElement
    ? programHost.nextElementSibling
    : null;
  const sceneHost = root.querySelector<HTMLElement>('.combat-lab-stage10-scene-host');
  const services = CombatLabWorkspaceServices.create({
    state: session.state,
    draft: internals.draft,
    onExperimentChanged: (experiment) => internals.handleExperimentChanged(experiment, 'external'),
    initialMapToolMode: 'program_authoring',
    mapToolEventTarget: window,
    mapToolStatusHost: mapModeStatus ?? undefined,
    getMapToolStatusOverride: () => (
      sceneHost?.inert || programHost?.inert
        ? 'Карта заблокирована до остановки или сброса прогона.'
        : null
    ),
  });
  const unregisterServices = registerCombatLabWorkspaceServices(root, services);

  const removeTickerListener = context.addTickerListener(() => services.selection.syncFromState());
  const handleRootClick = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const modeButton = target.closest<HTMLElement>('[data-map-mode]');
    if (modeButton) {
      const mode = modeButton.dataset.mapMode === 'manual_control' ? 'manual_control' : 'program_authoring';
      services.mapTools.setPersistentMode(mode);
      return;
    }
    if (target.closest('button')) return;
    const participantCard = target.closest<HTMLElement>('.combat-lab-participant-card[data-role-id]');
    const roleId = participantCard?.dataset.roleId;
    if (!roleId) return;
    const role = services.draft.get().roles.find((candidate) => candidate.roleId === roleId);
    if (role) services.selection.select({ kind: 'participant', roleId: role.roleId, unitId: role.unitId });
  };
  root.addEventListener('click', handleRootClick);

  const statusObserver = mapModeStatus
    ? new MutationObserver(() => {
      if (mapModeStatus.textContent !== services.mapTools.getStatusText()) services.mapTools.refreshStatus();
    })
    : null;
  statusObserver?.observe(mapModeStatus!, { childList: true, characterData: true, subtree: true });
  services.selection.syncFromState();
  services.mapTools.refreshStatus();

  let destroyed = false;
  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      statusObserver?.disconnect();
      root.removeEventListener('click', handleRootClick);
      removeTickerListener();
      unregisterServices();
      services.destroy();
      extension.destroy();
    },
  };
}
