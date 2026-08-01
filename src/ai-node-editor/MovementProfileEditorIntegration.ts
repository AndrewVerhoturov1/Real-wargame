import type { GameEditorInstallation, GameEditorMountContext } from '../game-editors/GameEditorTypes';
import {
  getMovementProfileRegistry,
  subscribeMovementProfileRegistry,
} from './MovementProfileBrowserStorage';
import {
  disposeMovementProfileEditorPanel,
  renderMovementProfiles,
  requestMovementProfileEditorLeave,
} from './MovementProfileEditorPanel';
import { setMovementProfileSelectorProvider } from './MovementProfileSelectorProvider';

/**
 * Historical flat-navigation metadata retained for migration contract checks.
 * The shared platform mount replaces the former flat-navigation hook.
 */
export const MOVEMENT_PROFILE_EDITOR_LEGACY_METADATA = {
  labelRu: 'Профили движения',
  order: 30,
} as const;

export function mountMovementProfileEditor(context: GameEditorMountContext): GameEditorInstallation {
  const panel = context.host;
  let selectorRegistry = getMovementProfileRegistry();
  let destroyed = false;

  setMovementProfileSelectorProvider({
    listProfiles: () => selectorRegistry.listProfiles().map((profile) => ({
      id: profile.id,
      nameRu: profile.nameRu,
      revision: profile.revision,
    })),
  });
  const unsubscribe = subscribeMovementProfileRegistry((next) => {
    selectorRegistry = next;
  });
  renderMovementProfiles(panel);

  const requestedProfileId = context.request.profileId;
  if (requestedProfileId) {
    panel.querySelector<HTMLButtonElement>(`[data-movement-profile-id="${cssEscape(requestedProfileId)}"]`)?.click();
  }

  return {
    beforeClose: requestMovementProfileEditorLeave,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      setMovementProfileSelectorProvider(null);
      disposeMovementProfileEditorPanel();
      panel.replaceChildren();
    },
  };
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
