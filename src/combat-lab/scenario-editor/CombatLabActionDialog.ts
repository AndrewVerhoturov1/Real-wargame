import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import type { CombatLabScenarioEditorCapabilitiesV1 } from './CombatLabScenarioEditorTypes';
import { CombatLabStepInspector } from './CombatLabStepInspector';
import './combat-lab-action-dialog.css';

export interface CombatLabActionDialogOptions {
  readonly draft: CombatLabExperimentDraft;
  readonly trackId: string;
  readonly stepId: string;
  readonly capabilities?: CombatLabScenarioEditorCapabilitiesV1;
  readonly onDraftMutation: (mutation: () => void) => void;
  readonly onError: (messageRu: string) => void;
  readonly returnFocusTo?: HTMLElement | null;
}

export class CombatLabActionDialog {
  static open(options: CombatLabActionDialogOptions): CombatLabActionDialog {
    return new CombatLabActionDialog(options);
  }

  readonly root = document.createElement('dialog');
  private readonly inspectorHost = document.createElement('div');
  private readonly inspector: CombatLabStepInspector;
  private destroyed = false;

  private constructor(private readonly options: CombatLabActionDialogOptions) {
    this.root.className = 'combat-lab-action-dialog';
    this.root.setAttribute('aria-label', 'Редактирование действия');
    const header = document.createElement('header');
    header.className = 'combat-lab-action-dialog__header';
    const title = document.createElement('h2');
    title.textContent = 'Изменить действие';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Закрыть';
    close.addEventListener('click', () => this.root.close());
    header.append(title, close);
    this.inspectorHost.className = 'combat-lab-action-dialog__content';
    this.root.append(header, this.inspectorHost);
    this.inspector = new CombatLabStepInspector({
      host: this.inspectorHost,
      draft: options.draft,
      capabilities: options.capabilities,
      onDraftMutation: options.onDraftMutation,
      onError: options.onError,
    });
    this.inspector.render(options.trackId, options.stepId);
    this.root.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.root.close();
    });
    this.root.addEventListener('close', () => this.destroy(), { once: true });
    document.body.append(this.root);
    this.root.showModal();
    queueMicrotask(() => this.root.querySelector<HTMLElement>('input, select, button')?.focus());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.inspector.destroy();
    this.root.remove();
    this.options.returnFocusTo?.focus();
  }
}
