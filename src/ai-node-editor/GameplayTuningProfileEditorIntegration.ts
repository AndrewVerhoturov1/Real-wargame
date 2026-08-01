import type { GameEditorInstallation, GameEditorMountContext } from '../game-editors/GameEditorTypes';
import './gameplay-tuning-profile-editor.css';
import {
  mountGameplayTuningProfileEditor,
  type GameplayTuningEditorKind,
} from './GameplayTuningProfileEditor';

export function mountPerceptionProfileEditor(
  context: GameEditorMountContext,
): GameEditorInstallation {
  return mount(context, 'perception');
}

export function mountSoldierArchetypeEditor(
  context: GameEditorMountContext,
): GameEditorInstallation {
  return mount(context, 'archetype');
}

export function mountConditionProfileEditor(
  context: GameEditorMountContext,
): GameEditorInstallation {
  return mount(context, 'condition');
}

function mount(
  context: GameEditorMountContext,
  kind: GameplayTuningEditorKind,
): GameEditorInstallation {
  const editor = mountGameplayTuningProfileEditor(context, kind);
  let destroyed = false;
  return {
    beforeClose: () => editor.beforeClose(),
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      editor.destroy();
      context.host.replaceChildren();
    },
  };
}
