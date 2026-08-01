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
 * This mount replaces the former registerAiEditorSection integration.
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
