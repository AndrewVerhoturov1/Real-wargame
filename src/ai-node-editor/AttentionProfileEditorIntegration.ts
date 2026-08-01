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

  let dirty = false;
  let destroyed = false;
  const controller = new AbortController();
  const signal = controller.signal;

  panel.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const profileButton = target?.closest<HTMLButtonElement>('[data-attention-profile-id]');
    if (profileButton && dirty) {
      if (!window.confirm('Отменить несохранённые изменения и открыть другой профиль внимания?')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      dirty = false;
    }

    const actionButton = target?.closest<HTMLButtonElement>('[data-attention-action]');
    const action = actionButton?.dataset.attentionAction;
    if (action === 'cancel' || action === 'save' || action === 'reset' || action === 'delete' || action === 'import') {
      queueMicrotask(() => { dirty = false; });
    }
  }, { capture: true, signal });

  panel.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.matches('[data-attention-number], [data-attention-text]')) dirty = true;
  }, { signal });

  renderAttentionProfiles(panel);
  const requestedProfileId = context.request.profileId;
  if (requestedProfileId) {
    panel.querySelector<HTMLButtonElement>(`[data-attention-profile-id="${cssEscape(requestedProfileId)}"]`)?.click();
  }

  return {
    beforeClose(): boolean {
      if (!dirty) return true;
      if (!window.confirm('Отменить несохранённые изменения профиля внимания и закрыть редактор?')) return false;
      panel.querySelector<HTMLButtonElement>('[data-attention-action="cancel"]')?.click();
      dirty = false;
      return true;
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

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
