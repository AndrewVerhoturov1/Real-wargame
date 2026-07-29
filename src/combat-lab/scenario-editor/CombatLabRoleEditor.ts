import type { SimulationState } from '../../core/simulation/SimulationState';
import type {
  CombatLabExperimentRoleV1,
  CombatLabExperimentV1,
} from '../../core/testing/combat-lab/experiment';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';

export interface CombatLabRoleEditorOptions {
  readonly host: HTMLElement;
  readonly state: SimulationState;
  readonly draft: CombatLabExperimentDraft;
  readonly getSelectedUnitId: () => string | null;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onError: (messageRu: string) => void;
}

type RoleCapability = CombatLabExperimentRoleV1['selectableAs'][number];

const CAPABILITY_LABELS: ReadonlyArray<readonly [RoleCapability, string]> = [
  ['shooter', 'Стрелок'],
  ['target', 'Цель'],
  ['assistant', 'Помощник'],
  ['first_aid_actor', 'Оказывает помощь'],
  ['first_aid_target', 'Получает помощь'],
  ['ammo_source', 'Источник патронов'],
  ['ammo_target', 'Получатель патронов'],
];

export class CombatLabRoleEditor {
  readonly root = document.createElement('section');
  private destroyed = false;

  constructor(private readonly options: CombatLabRoleEditorOptions) {
    this.root.className = 'combat-lab-role-editor combat-lab-panel';
    options.host.append(this.root);
    this.render();
  }

  render(): void {
    if (this.destroyed) return;
    const experiment = this.options.draft.getExperiment();
    const selectedUnitId = this.options.getSelectedUnitId();
    const heading = document.createElement('header');
    heading.className = 'combat-lab-role-editor-heading';
    heading.append(
      text('h3', 'combat-lab-section-title', 'Роли бойцов'),
      text('span', '', selectedUnitId ? `Выбран: ${selectedUnitId}` : 'Боец на карте не выбран'),
    );
    const create = button('Назначить роль выбранному бойцу', () => this.openEditor(null));
    create.disabled = !selectedUnitId;
    const list = document.createElement('div');
    list.className = 'combat-lab-role-list';
    for (const role of experiment.roles) list.append(this.roleRow(role));
    if (experiment.roles.length === 0) list.append(text('div', 'combat-lab-editor-empty', 'Роли ещё не назначены.'));
    this.root.replaceChildren(heading, create, list);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.remove();
  }

  private roleRow(role: CombatLabExperimentRoleV1): HTMLElement {
    const row = document.createElement('div');
    row.className = 'combat-lab-role-row';
    const info = document.createElement('div');
    info.append(
      text('strong', '', role.titleRu),
      text('code', '', role.roleId),
      text('span', '', `unit: ${role.unitId}`),
    );
    const actions = document.createElement('div');
    actions.append(
      button('Изменить', () => this.openEditor(role)),
      button('Удалить', () => this.removeRole(role.roleId), 'danger'),
    );
    row.append(info, actions);
    return row;
  }

  private openEditor(existing: CombatLabExperimentRoleV1 | null): void {
    const selectedUnitId = this.options.getSelectedUnitId();
    const unitId = existing?.unitId ?? selectedUnitId;
    if (!unitId) return this.options.onError('Выберите бойца на карте.');
    const dialog = document.createElement('dialog');
    dialog.className = 'combat-lab-role-dialog';
    const experiment = this.options.draft.getExperiment();
    const roleId = document.createElement('input');
    roleId.type = 'text';
    roleId.value = existing?.roleId ?? nextRoleId(experiment);
    roleId.disabled = existing !== null;
    const title = document.createElement('input');
    title.type = 'text';
    title.value = existing?.titleRu ?? nextRoleTitle(experiment);
    const unit = document.createElement('select');
    for (const candidate of this.options.state.units) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = `${candidate.labels.ru} · ${candidate.id}`;
      unit.append(option);
    }
    unit.value = unitId;
    const capabilities = document.createElement('div');
    capabilities.className = 'combat-lab-role-capabilities';
    const selected = new Set<RoleCapability>(existing?.selectableAs ?? inferCapabilities(this.options.state, unitId));
    for (const [value, label] of CAPABILITY_LABELS) {
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = selected.has(value);
      check.addEventListener('change', () => check.checked ? selected.add(value) : selected.delete(value));
      const control = document.createElement('label');
      control.append(check, document.createTextNode(label));
      capabilities.append(control);
    }
    const status = text('div', 'combat-lab-editor-status', '');
    const save = button('Сохранить роль', () => {
      const id = normalizeRoleId(roleId.value);
      if (!id) {
        status.textContent = 'Укажите стабильный role ID латиницей.';
        status.classList.add('is-error');
        return;
      }
      if (!existing && experiment.roles.some((role) => role.roleId === id)) {
        status.textContent = `Role ID «${id}» уже используется.`;
        status.classList.add('is-error');
        return;
      }
      const role: CombatLabExperimentRoleV1 = {
        roleId: existing?.roleId ?? id,
        unitId: unit.value,
        titleRu: title.value.trim() || existing?.titleRu || 'Роль',
        selectableAs: [...selected],
      };
      try {
        this.options.draft.assignRole(role);
        const next = this.options.draft.getExperiment();
        this.options.onExperimentChanged(next);
        dialog.close();
        this.render();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Не удалось сохранить роль.';
        status.classList.add('is-error');
      }
    }, 'primary');
    const cancel = button('Отмена', () => dialog.close());
    dialog.append(
      text('h3', '', existing ? 'Изменить роль' : 'Новая роль'),
      field('Стабильный ID', roleId),
      field('Русское название', title),
      field('Боец', unit),
      text('span', 'combat-lab-role-capability-title', 'Доступна как'),
      capabilities,
      status,
      actions(save, cancel),
    );
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }

  private removeRole(roleId: string): void {
    try {
      this.options.draft.removeRole(roleId);
      this.options.onExperimentChanged(this.options.draft.getExperiment());
      this.render();
    } catch (error) {
      this.options.onError(error instanceof Error ? error.message : 'Не удалось удалить роль.');
    }
  }
}

function inferCapabilities(state: SimulationState, unitId: string): readonly RoleCapability[] {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return ['target'];
  const result: RoleCapability[] = ['target', 'first_aid_target', 'ammo_target'];
  if (unit.infantryCombatRuntime.primaryWeapon) result.push('shooter', 'ammo_source');
  result.push('first_aid_actor');
  if (unit.type === 'support_team') result.push('assistant');
  return result;
}

function nextRoleId(experiment: CombatLabExperimentV1): string {
  const used = new Set(experiment.roles.map((role) => role.roleId));
  for (let index = 1; index <= 1000; index += 1) {
    const id = `role-${index}`;
    if (!used.has(id)) return id;
  }
  return `role-${experiment.roles.length + 1}`;
}

function nextRoleTitle(experiment: CombatLabExperimentV1): string {
  return `Роль №${experiment.roles.length + 1}`;
}

function normalizeRoleId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  if (className) control.className = className;
  control.addEventListener('click', onClick);
  return control;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const root = document.createElement('label');
  root.className = 'combat-lab-field';
  root.append(text('span', '', label), control);
  return root;
}

function actions(...children: HTMLElement[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'combat-lab-row';
  root.append(...children);
  return root;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
