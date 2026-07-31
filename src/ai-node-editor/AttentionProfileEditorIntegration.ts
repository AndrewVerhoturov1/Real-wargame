import type { GameEditorInstallation, GameEditorMountContext } from '../game-editors/GameEditorTypes';
import { renderAttentionProfiles } from './AttentionProfileEditorPanel';

let reusablePanel: HTMLElement | null = null;
let parking: DocumentFragment | null = null;

export function mountAttentionProfileEditor(context: GameEditorMountContext): GameEditorInstallation {
  const host = context.host;
  const panel = reusablePanel ?? document.createElement('div');
  reusablePanel = panel;
  parking ??= document.createDocumentFragment();
  panel.hidden = false;
  host.replaceChildren(panel);
  renderAttentionProfiles(panel);

  let dirty = false;
  let destroyed = false;
  const controller = new AbortController();
  const signal = controller.signal;
  panel.addEventListener('input', () => { dirty = true; }, { signal });
  panel.addEventListener('change', () => { dirty = true; }, { signal });
  panel.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-attention-action]')
      : null;
    if (!target) return;
    const action = target.dataset.attentionAction;
    if (action === 'cancel' || action === 'save' || action === 'reset' || action === 'delete' || action === 'import') {
      queueMicrotask(() => { dirty = false; });
    }
  }, { signal });

  return {
    beforeClose(): boolean {
      if (!dirty) return true;
      return window.confirm('Отменить несохранённые изменения профиля внимания и закрыть редактор?');
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      controller.abort();
      panel.hidden = true;
      parking?.append(panel);
    },
  };
}
