import type { GameEditorInstallation, GameEditorMountContext } from '../game-editors/GameEditorTypes';
import {
  disposeEnvironmentProfileEditorPanel,
  renderEnvironmentProfiles,
  requestEnvironmentProfileEditorLeave,
} from './EnvironmentProfileEditorPanel';

/** Historical flat-navigation metadata retained for migration contract checks. */
export const ENVIRONMENT_PROFILE_EDITOR_LEGACY_METADATA = {
  labelRu: 'Профили местности',
  order: 25,
} as const;

export function mountEnvironmentProfileEditor(context: GameEditorMountContext): GameEditorInstallation {
  const panel = context.host;
  let destroyed = false;
  renderEnvironmentProfiles(panel);
  return {
    beforeClose: requestEnvironmentProfileEditorLeave,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      disposeEnvironmentProfileEditorPanel();
      panel.replaceChildren();
    },
  };
}
