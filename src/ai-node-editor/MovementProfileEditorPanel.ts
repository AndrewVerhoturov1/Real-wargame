import {
  MovementProfileImportError,
  MovementProfileRegistry,
  getBuiltInMovementProfile,
  type MovementProfile,
} from '../core/movement/MovementProfiles';
import {
  getMovementProfileRegistry,
  saveMovementProfileRegistry,
  subscribeMovementProfileRegistry,
} from './MovementProfileBrowserStorage';
import { MOVEMENT_EDITOR_GROUPS, type MovementEditorField } from './MovementProfileEditorSchema';
import { renderMovementProfileEditorView } from './MovementProfileEditorView';

let registry = getMovementProfileRegistry();
let selectedId = registry.listProfiles()[0]?.id ?? 'normal_walk';
let draft = registry.requireProfile(selectedId);
let activePanel: HTMLElement | null = null;
let unsubscribe: (() => void) | null = null;
let pendingRegistry: MovementProfileRegistry | null = null;
let dirty = false;
let beforeUnloadInstalled = false;
let activeDialog: HTMLDialogElement | null = null;

export function renderMovementProfiles(panel: HTMLElement): void {
  activePanel = panel;
  panel.dataset.activeProfileEditor = 'movement';
  ensureSubscription();
  ensureBeforeUnloadGuard();
  panel.innerHTML = renderMovementProfileEditorView(registry, draft, selectedId, dirty);
  bind(panel);
}

export function hasUnsavedMovementProfileDraft(): boolean {
  return dirty;
}

export async function requestMovementProfileEditorLeave(): Promise<boolean> {
  if (!dirty) return true;
  const decision = await confirmDraftTransition();
  if (decision === 'stay') return false;
  if (decision === 'save') {
    if (!activePanel) return false;
    return saveDraft(activePanel);
  }
  discardDraft();
  return true;
}

export function disposeMovementProfileEditorPanel(): void {
  unsubscribe?.();
  unsubscribe = null;
  pendingRegistry = null;
  activePanel = null;
  activeDialog?.close();
  activeDialog?.remove();
  activeDialog = null;
  if (beforeUnloadInstalled) {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    beforeUnloadInstalled = false;
  }
}

function ensureSubscription(): void {
  if (unsubscribe) return;
  unsubscribe = subscribeMovementProfileRegistry((nextRegistry) => {
    if (dirty) {
      pendingRegistry = nextRegistry;
      updateStatus('Профили изменились в другой вкладке. Сохраните или отмените текущий draft.');
      return;
    }
    applyRegistry(nextRegistry);
    if (activePanel?.dataset.activeProfileEditor === 'movement') renderMovementProfiles(activePanel);
  });
}

function ensureBeforeUnloadGuard(): void {
  if (beforeUnloadInstalled) return;
  beforeUnloadInstalled = true;
  window.addEventListener('beforeunload', handleBeforeUnload);
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
}

function bind(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLButtonElement>('[data-movement-profile-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextId = button.dataset.movementProfileId;
      if (nextId) void selectProfile(panel, nextId);
    });
  });

  panel.querySelectorAll<HTMLInputElement>('[data-movement-number]').forEach((input) => {
    input.addEventListener('input', () => {
      const path = input.dataset.movementNumber ?? '';
      const field = MOVEMENT_EDITOR_GROUPS.flatMap((group) => group[2]).find((item) => item[0] === path);
      const value = clamp(
        Number(input.value),
        field?.[3] ?? Number(input.min || 0),
        field?.[4] ?? Number(input.max || 100000),
      );
      setPath(path, value);
      panel.querySelectorAll<HTMLInputElement>(`[data-movement-number="${css(path)}"]`).forEach((peer) => {
        if (peer !== input) peer.value = String(value);
      });
      updateWarning(panel, path, value, field);
      markDirty(panel);
    });
  });

  panel.querySelectorAll<HTMLInputElement>('[data-movement-text]').forEach((input) => {
    input.addEventListener('input', () => {
      setPath(input.dataset.movementText ?? '', input.value);
      markDirty(panel);
    });
  });

  panel.querySelectorAll<HTMLTextAreaElement>('[data-movement-area]').forEach((input) => {
    input.addEventListener('input', () => {
      setPath(input.dataset.movementArea ?? '', input.value);
      markDirty(panel);
    });
  });

  panel.querySelectorAll<HTMLSelectElement>('[data-movement-select]').forEach((input) => {
    input.addEventListener('change', () => {
      setPath(input.dataset.movementSelect ?? '', input.value || null);
      markDirty(panel);
    });
  });

  panel.querySelectorAll<HTMLInputElement>('[data-movement-checkbox]').forEach((input) => {
    input.addEventListener('change', () => {
      setPath(input.dataset.movementCheckbox ?? '', input.checked);
      markDirty(panel);
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-movement-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      const path = button.dataset.movementReset ?? '';
      setPath(path, getPath(getBuiltInMovementProfile(draft.templateProfileId), path));
      dirty = true;
      renderMovementProfiles(panel);
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-movement-action]').forEach((button) => {
    button.addEventListener('click', () => void handleAction(panel, button.dataset.movementAction ?? ''));
  });

  panel.querySelector<HTMLInputElement>('[data-movement-import]')?.addEventListener(
    'change',
    (event) => void importFile(panel, event),
  );
}

async function selectProfile(panel: HTMLElement, nextId: string): Promise<void> {
  if (nextId === selectedId) return;
  if (!(await requestMovementProfileEditorLeave())) return;
  selectedId = nextId;
  draft = registry.requireProfile(selectedId);
  dirty = false;
  renderMovementProfiles(panel);
}

async function handleAction(panel: HTMLElement, name: string): Promise<void> {
  if (name === 'save') {
    saveDraft(panel);
    return;
  }
  if (name === 'cancel') {
    discardDraft();
    renderMovementProfiles(panel);
    return;
  }

  if (['reset', 'create', 'copy', 'rename', 'delete', 'import'].includes(name)
    && !(await requestMovementProfileEditorLeave())) return;

  if (name === 'reset') {
    if (!window.confirm(`Сбросить профиль «${draft.nameRu}»?`)) return;
    registry.resetProfile(selectedId);
    dirty = false;
    pendingRegistry = null;
    saveMovementProfileRegistry(registry);
    draft = registry.requireProfile(selectedId);
    renderMovementProfiles(panel);
    return;
  }

  if (name === 'create' || name === 'copy') {
    const nameRu = window.prompt(
      'Название нового профиля:',
      name === 'copy' ? `${draft.nameRu} — копия` : 'Новый профиль движения',
    );
    if (!nameRu) return;
    const id = uniqueId(slug(nameRu));
    const created = registry.createCustomProfile(
      id,
      id,
      nameRu,
      name === 'copy' ? selectedId : 'normal_walk',
    );
    selectedId = created.id;
    draft = created;
    dirty = false;
    pendingRegistry = null;
    saveMovementProfileRegistry(registry);
    renderMovementProfiles(panel);
    return;
  }

  if (name === 'rename') {
    const nameRu = window.prompt('Новое русское название:', draft.nameRu);
    if (!nameRu) return;
    const nameEn = window.prompt('Новое английское название:', draft.nameEn) || draft.nameEn;
    registry.renameProfile(selectedId, nameEn, nameRu);
    dirty = false;
    pendingRegistry = null;
    saveMovementProfileRegistry(registry);
    draft = registry.requireProfile(selectedId);
    renderMovementProfiles(panel);
    return;
  }

  if (name === 'delete') {
    if (draft.builtIn || !window.confirm(`Удалить профиль «${draft.nameRu}»?`)) return;
    registry.deleteProfile(selectedId);
    selectedId = 'normal_walk';
    dirty = false;
    pendingRegistry = null;
    saveMovementProfileRegistry(registry);
    draft = registry.requireProfile(selectedId);
    renderMovementProfiles(panel);
    return;
  }

  if (name === 'export') {
    download('real-wargame-movement-profiles.json', registry.exportJson());
    return;
  }

  if (name === 'import') {
    panel.querySelector<HTMLInputElement>('[data-movement-import]')?.click();
  }
}

function saveDraft(panel: HTMLElement): boolean {
  try {
    const { id: _id, revision: _revision, builtIn: _builtIn, ...changes } = draft;
    draft = registry.updateProfile(selectedId, changes);
    dirty = false;
    pendingRegistry = null;
    saveMovementProfileRegistry(registry);
    renderMovementProfiles(panel);
    return true;
  } catch (error) {
    window.alert(`Не удалось сохранить профиль движения: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function discardDraft(): void {
  dirty = false;
  if (pendingRegistry) {
    applyRegistry(pendingRegistry);
    pendingRegistry = null;
    return;
  }
  draft = registry.requireProfile(selectedId);
}

function applyRegistry(nextRegistry: MovementProfileRegistry): void {
  registry = nextRegistry;
  const selected = registry.findProfile(selectedId);
  if (!selected) selectedId = 'normal_walk';
  draft = registry.requireProfile(selectedId);
  dirty = false;
}

async function importFile(panel: HTMLElement, event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const candidate = MovementProfileRegistry.importJson(await file.text());
    registry = candidate;
    if (!registry.findProfile(selectedId)) selectedId = 'normal_walk';
    draft = registry.requireProfile(selectedId);
    dirty = false;
    pendingRegistry = null;
    saveMovementProfileRegistry(candidate);
    renderMovementProfiles(panel);
  } catch (error) {
    window.alert(formatImportErrorRu(error));
  }
}

function formatImportErrorRu(error: unknown): string {
  if (error instanceof MovementProfileImportError) {
    const problems = error.issues.map((item, index) => `${index + 1}. ${item.path}: ${item.messageRu}`);
    return `Импорт отменён. Текущий реестр не изменён.\n\n${problems.join('\n')}`;
  }
  return `Импорт отменён. Текущий реестр не изменён.\n\n${error instanceof Error ? error.message : String(error)}`;
}

function confirmDraftTransition(): Promise<'save' | 'discard' | 'stay'> {
  activeDialog?.close();
  activeDialog?.remove();
  const dialog = document.createElement('dialog');
  activeDialog = dialog;
  dialog.className = 'movement-profile-draft-dialog';
  dialog.innerHTML = `
    <section>
      <h2>Есть несохранённые изменения</h2>
      <p>Сохранить draft текущего профиля перед переходом?</p>
      <div>
        <button type="button" data-draft-decision="save" class="primary">Сохранить</button>
        <button type="button" data-draft-decision="discard">Отменить изменения</button>
        <button type="button" data-draft-decision="stay">Остаться</button>
      </div>
    </section>`;
  document.body.append(dialog);

  return new Promise((resolve) => {
    const finish = (decision: 'save' | 'discard' | 'stay'): void => {
      if (activeDialog === dialog) activeDialog = null;
      dialog.close();
      dialog.remove();
      resolve(decision);
    };
    dialog.querySelectorAll<HTMLButtonElement>('[data-draft-decision]').forEach((button) => {
      button.addEventListener('click', () => {
        const decision = button.dataset.draftDecision;
        finish(decision === 'save' || decision === 'discard' ? decision : 'stay');
      });
    });
    dialog.addEventListener('cancel', (cancelEvent) => {
      cancelEvent.preventDefault();
      finish('stay');
    }, { once: true });
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-draft-decision="stay"]')?.focus();
  });
}

function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined
  ), source);
}

function setPath(path: string, value: unknown): void {
  const clone = structuredClone(draft) as unknown as Record<string, unknown>;
  const parts = path.split('.');
  let target = clone;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts[parts.length - 1] ?? ''] = value;
  draft = clone as unknown as MovementProfile;
}

function updateWarning(
  panel: HTMLElement,
  path: string,
  value: number,
  field: MovementEditorField | undefined,
): void {
  const warning = panel.querySelector<HTMLElement>(`[data-movement-warning="${css(path)}"]`);
  if (!warning || !field) return;
  const min = field[3];
  const max = field[4];
  const edge = (max - min) * .08;
  warning.textContent = value <= min + edge || value >= max - edge ? 'Экстремальное значение' : '';
}

function markDirty(panel: HTMLElement): void {
  dirty = true;
  updateStatus('Есть несохранённые изменения.', panel);
  panel.querySelectorAll<HTMLButtonElement>(
    '[data-movement-action="save"], [data-movement-action="cancel"]',
  ).forEach((button) => {
    button.disabled = false;
  });
}

function updateStatus(message: string, panel: HTMLElement | null = activePanel): void {
  const status = panel?.querySelector<HTMLElement>('[data-movement-status]');
  if (status) status.textContent = message;
}

function uniqueId(base: string): string {
  let candidate = base || 'custom_movement';
  let suffix = 2;
  while (registry.hasProfile(candidate)) candidate = `${base || 'custom_movement'}_${suffix++}`;
  return candidate;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    || `custom_${Date.now().toString(36)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function css(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function download(name: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
