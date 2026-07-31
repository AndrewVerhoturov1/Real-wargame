import type { CombatLabExperimentV1, CombatLabTrackV1 } from '../../core/testing/combat-lab/experiment';

export type CombatLabTrackInsertionV1 = 'end' | 'before_selected' | 'after_selected';

export interface CombatLabTrackCreationV1 {
  readonly titleRu: string;
  readonly actorRoleId: string;
  readonly insertion: CombatLabTrackInsertionV1;
  readonly selectedTrackId: string | null;
}

export interface CombatLabTrackDialogOptionsV1 {
  readonly experiment: CombatLabExperimentV1;
  readonly selectedActorRoleId: string | null;
  readonly selectedTrackId: string | null;
  readonly onSave: (value: CombatLabTrackCreationV1) => void;
  readonly returnFocusTo?: HTMLElement | null;
}

export type CombatLabTrackCreationValidationV1 =
  | { readonly ok: true; readonly reasonRu: null }
  | { readonly ok: false; readonly reasonRu: string };

export function validateCombatLabTrackCreation(
  experiment: Pick<CombatLabExperimentV1, 'roles' | 'tracks'>,
  value: CombatLabTrackCreationV1,
): CombatLabTrackCreationValidationV1 {
  if (!value.actorRoleId) return { ok: false, reasonRu: 'Выберите исполнителя дорожки.' };
  if (!experiment.roles.some((role) => role.roleId === value.actorRoleId)) {
    return { ok: false, reasonRu: 'Выбранный исполнитель больше не существует.' };
  }
  if (experiment.tracks.some((track) => track.actorRoleId === value.actorRoleId)) {
    return { ok: false, reasonRu: 'Для этого бойца дорожка уже существует.' };
  }
  if (!value.titleRu.trim()) return { ok: false, reasonRu: 'Введите понятное название дорожки.' };
  return { ok: true, reasonRu: null };
}

export function resolveCombatLabTrackInsertionIndex(
  tracks: readonly Pick<CombatLabTrackV1, 'trackId'>[],
  insertion: CombatLabTrackInsertionV1,
  selectedTrackId: string | null,
): number {
  if (insertion === 'end' || !selectedTrackId) return tracks.length;
  const selectedIndex = tracks.findIndex((track) => track.trackId === selectedTrackId);
  if (selectedIndex < 0) return tracks.length;
  return insertion === 'before_selected' ? selectedIndex : selectedIndex + 1;
}

export class CombatLabTrackDialog {
  readonly root = document.createElement('dialog');
  private readonly titleInput = document.createElement('input');
  private readonly actorSelect = document.createElement('select');
  private readonly insertionSelect = document.createElement('select');
  private readonly errorHost = document.createElement('div');
  private destroyed = false;

  private constructor(private readonly options: CombatLabTrackDialogOptionsV1) {
    this.root.className = 'combat-lab-dialog combat-lab-track-dialog';
    this.root.setAttribute('aria-label', 'Создать дорожку');

    const heading = document.createElement('h2');
    heading.textContent = 'Создать дорожку';
    const intro = document.createElement('p');
    intro.textContent = 'Дорожка последовательно выполняет действия выбранного бойца.';

    this.titleInput.type = 'text';
    this.titleInput.maxLength = 80;
    this.titleInput.value = suggestedTitle(options.experiment, options.selectedActorRoleId);
    this.titleInput.autocomplete = 'off';

    appendOption(this.actorSelect, '', 'Выберите бойца…');
    for (const role of options.experiment.roles) {
      const alreadyUsed = options.experiment.tracks.some((track) => track.actorRoleId === role.roleId);
      const option = appendOption(this.actorSelect, role.roleId, role.titleRu);
      option.disabled = alreadyUsed;
      if (alreadyUsed) option.textContent = `${role.titleRu} — дорожка уже есть`;
    }
    this.actorSelect.value = options.selectedActorRoleId ?? '';
    if (this.actorSelect.selectedOptions[0]?.disabled) this.actorSelect.value = '';

    appendOption(this.insertionSelect, 'end', 'В конец списка');
    appendOption(this.insertionSelect, 'before_selected', 'Перед выбранной дорожкой');
    appendOption(this.insertionSelect, 'after_selected', 'После выбранной дорожки');
    this.insertionSelect.value = options.selectedTrackId ? 'after_selected' : 'end';
    for (const option of this.insertionSelect.options) {
      if (option.value !== 'end') option.disabled = !options.selectedTrackId;
    }

    this.errorHost.className = 'combat-lab-dialog-error';
    this.errorHost.setAttribute('role', 'alert');

    const actions = document.createElement('footer');
    actions.className = 'combat-lab-dialog-actions';
    const cancel = button('Отмена', () => this.root.close('cancel'));
    const save = button('Сохранить', () => this.save());
    save.classList.add('primary');
    actions.append(cancel, save);

    const form = document.createElement('form');
    form.method = 'dialog';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.save();
    });
    form.append(
      heading,
      intro,
      field('Название дорожки', this.titleInput),
      field('Исполнитель', this.actorSelect),
      field('Расположение', this.insertionSelect),
      this.errorHost,
      actions,
    );
    this.root.append(form);
    this.root.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.root.close('cancel');
    });
    this.root.addEventListener('keydown', this.handleFocusTrap);
    this.root.addEventListener('close', () => this.destroy(), { once: true });
    document.body.append(this.root);
    this.root.showModal();
    queueMicrotask(() => this.actorSelect.focus());
  }

  static open(options: CombatLabTrackDialogOptionsV1): CombatLabTrackDialog {
    return new CombatLabTrackDialog(options);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.removeEventListener('keydown', this.handleFocusTrap);
    this.root.remove();
    this.options.returnFocusTo?.focus();
  }

  private save(): void {
    const value: CombatLabTrackCreationV1 = {
      titleRu: this.titleInput.value.trim(),
      actorRoleId: this.actorSelect.value,
      insertion: this.insertionSelect.value as CombatLabTrackInsertionV1,
      selectedTrackId: this.options.selectedTrackId,
    };
    const validation = validateCombatLabTrackCreation(this.options.experiment, value);
    if (!validation.ok) {
      this.errorHost.textContent = validation.reasonRu;
      (value.actorRoleId ? this.titleInput : this.actorSelect).focus();
      return;
    }
    this.options.onSave(value);
    this.root.close('save');
  }

  private readonly handleFocusTrap = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const focusable = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}

function suggestedTitle(experiment: CombatLabExperimentV1, roleId: string | null): string {
  const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
  return role ? `Дорожка: ${role.titleRu}` : 'Новая дорожка';
}

function appendOption(select: HTMLSelectElement, value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
  return option;
}

function field(labelRu: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'combat-lab-field';
  const title = document.createElement('span');
  title.textContent = labelRu;
  label.append(title, control);
  return label;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const result = document.createElement('button');
  result.type = 'button';
  result.textContent = label;
  result.addEventListener('click', action);
  return result;
}
