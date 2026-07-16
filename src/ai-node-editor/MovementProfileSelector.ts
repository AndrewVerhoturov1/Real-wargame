import type { MovementProfileRegistry } from '../core/movement/MovementProfiles';
import {
  getMovementProfileRegistry,
  subscribeMovementProfileRegistry,
} from '../core/movement/MovementProfileStorage';

export interface MovementProfileSelectorOptions {
  value: string | null;
  labelRu?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  onChange: (profileId: string | null) => void;
}

export interface MovementProfileSelectorControl {
  readonly element: HTMLLabelElement;
  getValue(): string | null;
  setValue(profileId: string | null): void;
  destroy(): void;
}

export interface MovementProfileSelectionState {
  requestedId: string | null;
  resolvedId: string | null;
  missing: boolean;
  messageRu: string;
}

export function resolveMovementProfileSelection(
  registry: MovementProfileRegistry,
  requestedId: string | null,
): MovementProfileSelectionState {
  if (!requestedId) {
    return {
      requestedId: null,
      resolvedId: null,
      missing: false,
      messageRu: 'Профиль не выбран.',
    };
  }
  if (registry.hasProfile(requestedId)) {
    return {
      requestedId,
      resolvedId: requestedId,
      missing: false,
      messageRu: `Выбран профиль «${registry.getProfile(requestedId).nameRu}».`,
    };
  }
  return {
    requestedId,
    resolvedId: null,
    missing: true,
    messageRu: `Профиль «${requestedId}» удалён или недоступен. Выберите другой профиль явно.`,
  };
}

export function createMovementProfileSelector(
  options: MovementProfileSelectorOptions,
): MovementProfileSelectorControl {
  let registry = getMovementProfileRegistry();
  let value = options.value;
  let destroyed = false;

  const element = document.createElement('label');
  element.className = 'movement-profile-selector';
  element.innerHTML = '<span></span><select></select><small aria-live="polite"></small>';
  const label = element.querySelector<HTMLSpanElement>('span');
  const select = element.querySelector<HTMLSelectElement>('select');
  const status = element.querySelector<HTMLElement>('small');
  if (!label || !select || !status) throw new Error('Movement profile selector failed to initialize.');
  label.textContent = options.labelRu ?? 'Профиль движения';
  select.disabled = Boolean(options.disabled);

  const render = (): void => {
    const state = resolveMovementProfileSelection(registry, value);
    const entries = registry.listProfiles();
    const html: string[] = [];
    if (options.allowEmpty) html.push('<option value="">Не выбран</option>');
    if (state.missing && value) {
      html.push(`<option value="${attribute(value)}" selected>Недоступен: ${htmlText(value)}</option>`);
    }
    for (const profile of entries) {
      html.push(`<option value="${attribute(profile.id)}" ${profile.id === value ? 'selected' : ''}>${htmlText(profile.nameRu)}</option>`);
    }
    select.innerHTML = html.join('');
    select.classList.toggle('has-error', state.missing);
    status.textContent = state.messageRu;
    status.classList.toggle('error', state.missing);
  };

  const unsubscribe = subscribeMovementProfileRegistry((nextRegistry) => {
    if (destroyed) return;
    registry = nextRegistry;
    render();
  });

  select.addEventListener('change', () => {
    value = select.value || null;
    options.onChange(value);
    render();
  });

  render();

  return {
    element,
    getValue: () => value,
    setValue(profileId: string | null): void {
      value = profileId;
      render();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      element.remove();
    },
  };
}

function htmlText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character] ?? character));
}

function attribute(value: string): string {
  return htmlText(value);
}
