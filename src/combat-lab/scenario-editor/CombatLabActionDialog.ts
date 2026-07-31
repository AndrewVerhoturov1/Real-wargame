import type { CombatLabScenarioEditorCapabilitiesV1 } from './CombatLabScenarioEditorTypes';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import { CombatLabStepDialog } from './CombatLabStepDialog';

export interface CombatLabActionDialogOptions {
  readonly draft: CombatLabExperimentDraft;
  readonly trackId: string;
  readonly stepId: string;
  readonly capabilities?: CombatLabScenarioEditorCapabilitiesV1;
  readonly onDraftMutation: (mutation: () => void) => void;
  readonly onError: (messageRu: string) => void;
  readonly returnFocusTo?: HTMLElement | null;
}

/**
 * Совместимый переходный фасад. Новое редактирование выполняет
 * CombatLabStepDialog и публикует изменение только по кнопке «Сохранить».
 */
export class CombatLabActionDialog {
  static open(options: CombatLabActionDialogOptions): CombatLabActionDialog {
    return new CombatLabActionDialog(CombatLabStepDialog.open(options));
  }

  readonly root: HTMLDialogElement;

  private constructor(private readonly dialog: CombatLabStepDialog) {
    this.root = dialog.root;
  }

  destroy(): void {
    this.dialog.destroy();
  }
}
