import type { GameEditorInstallation, GameEditorMountContext } from '../game-editors/GameEditorTypes';
import {
  disposeEnvironmentProfileEditorPanel,
  renderEnvironmentProfiles,
  requestEnvironmentProfileEditorLeave,
} from './EnvironmentProfileEditorPanel';

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
