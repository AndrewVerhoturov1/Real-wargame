import type { CombatLabAccuracyOverridesV1 } from '../../core/testing/combat-lab';
import {
  collectCombatLabParticipantProgramReferences,
  duplicateCombatLabParticipant,
  readCombatLabParticipantInitialSummaries,
  removeCombatLabParticipant,
  type CombatLabExperimentRoleV1,
  type CombatLabExperimentV1,
  type CombatLabParticipantInitialSummaryV1,
} from '../../core/testing/combat-lab/experiment';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import { CombatLabParticipantDialog } from './CombatLabParticipantDialog';
import { CombatLabParticipantParametersPanel } from './CombatLabParticipantParametersPanel';
import './combat-lab-participant-editor.css';

export interface CombatLabParticipantEditorOptions {
  readonly host: HTMLElement;
  readonly parametersHost?: HTMLElement;
  readonly draft: CombatLabExperimentDraft;
  readonly getSelectedUnitId?: () => string | null;
  readonly onExperimentChanged: (experiment: CombatLabExperimentV1) => void;
  readonly onError: (messageRu: string) => void;
}

export class CombatLabParticipantEditor {
  readonly root = document.createElement('section');
  private readonly listHost = document.createElement('div');
  private readonly message = document.createElement('div');
  private parametersPanel: CombatLabParticipantParametersPanel | null = null;
  private selectedRoleId: string | null = null;
  private destroyed = false;
  private stepAccuracyOverride: { readonly stepId: string; readonly accuracy: CombatLabAccuracyOverridesV1 } | null = null;

  constructor(private readonly options: CombatLabParticipantEditorOptions) {
    this.root.className = 'combat-lab-participant-editor combat-lab-panel';
    this.message.className = 'combat-lab-editor-status';
    this.listHost.className = 'combat-lab-participant-editor__list';
    options.host.append(this.root);
    this.refresh();
  }

  refresh(): void {
    if (this.destroyed) return;
    const experiment = this.options.draft.getExperiment();
    this.resolveSelection(experiment);
    const create = button('Создать бойца', () => this.openDialog(null), 'primary');
    const duplicate = button('Создать копию выбранного', () => this.duplicateSelected());
    duplicate.disabled = this.selectedRoleId === null;
    const header = document.createElement('header');
    header.className = 'combat-lab-participant-editor__header';
    header.append(text('h3', 'combat-lab-section-title', 'Бойцы сцены'), actions(create, duplicate));
    const summaries = new Map(readCombatLabParticipantInitialSummaries(experiment).map((summary) => [summary.roleId, summary]));
    this.listHost.replaceChildren(...experiment.roles.map((role) => this.card(role, summaries.get(role.roleId) ?? null)));
    if (experiment.roles.length === 0) this.listHost.append(text('div', 'combat-lab-editor-empty', 'В начальной сцене ещё нет участников эксперимента.'));
    this.root.replaceChildren(header, this.message, this.listHost);
    this.renderParameters();
  }

  setSelectedStepAccuracyOverride(stepId: string | null, accuracy: CombatLabAccuracyOverridesV1 | null): void {
    this.stepAccuracyOverride = stepId && accuracy ? { stepId, accuracy } : null;
    this.parametersPanel?.setStepAccuracyOverride(stepId, accuracy);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.parametersPanel?.destroy();
    this.parametersPanel = null;
    this.root.remove();
  }

  private card(role: CombatLabExperimentRoleV1, summary: CombatLabParticipantInitialSummaryV1 | null): HTMLElement {
    const card = document.createElement('article');
    card.className = 'combat-lab-participant-card';
    card.classList.toggle('is-selected', role.roleId === this.selectedRoleId);
    card.dataset.roleId = role.roleId;
    if (summary) {
      card.append(
        text('strong', 'combat-lab-participant-card__name', role.titleRu),
        text('code', 'combat-lab-participant-card__id', role.roleId),
        facts(
          ['Сторона', summary.side === 'red' ? 'Красные' : 'Синие'],
          ['Оружие', summary.weaponNameRu ?? 'Без оружия'],
          ['Поза', postureLabel(summary.posture)],
          ['Здоровье', summary.healthRu],
          ['Боеприпасы', summary.weaponNameRu ? `${summary.loadedRounds} в оружии, ${summary.reserveRounds} в запасе` : 'Нет'],
        ),
        actions(
          button('Изменить', () => this.openDialog(role.roleId)),
          button('Копировать', () => this.duplicate(role.roleId)),
          button('Удалить', () => this.remove(role.roleId), 'danger'),
        ),
      );
    } else {
      card.append(
        text('strong', 'combat-lab-participant-card__name', role.titleRu),
        text('div', 'combat-lab-editor-status is-error', 'Начальное состояние бойца повреждено.'),
      );
    }
    card.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button')) return;
      this.selectedRoleId = role.roleId;
      this.refresh();
    });
    return card;
  }

  private resolveSelection(experiment: CombatLabExperimentV1): void {
    if (this.selectedRoleId && experiment.roles.some((role) => role.roleId === this.selectedRoleId)) return;
    const selectedUnitId = this.options.getSelectedUnitId?.() ?? null;
    this.selectedRoleId = experiment.roles.find((role) => role.unitId === selectedUnitId)?.roleId ?? experiment.roles[0]?.roleId ?? null;
  }

  private renderParameters(): void {
    this.parametersPanel?.destroy();
    this.parametersPanel = null;
    const host = this.options.parametersHost;
    if (!host) return;
    host.replaceChildren();
    if (!this.selectedRoleId) {
      host.append(text('div', 'combat-lab-editor-empty', 'Выберите бойца во вкладке «Сцена».'));
      return;
    }
    this.parametersPanel = new CombatLabParticipantParametersPanel({
      host,
      draft: this.options.draft,
      roleId: this.selectedRoleId,
      onExperimentChanged: (experiment) => {
        this.options.onExperimentChanged(experiment);
        this.show('Параметры выбранного бойца сохранены.', false);
      },
      onError: (messageRu) => this.fail(messageRu),
      stepAccuracyOverride: this.stepAccuracyOverride,
    });
  }

  private openDialog(roleId: string | null): void {
    CombatLabParticipantDialog.open({
      draft: this.options.draft,
      roleId,
      onSaved: (experiment, savedRoleId) => {
        this.selectedRoleId = savedRoleId;
        this.options.onExperimentChanged(experiment);
        this.show(roleId ? 'Боец изменён.' : 'Боец создан.', false);
        this.refresh();
      },
      onError: (messageRu) => this.fail(messageRu),
    });
  }

  private duplicateSelected(): void { if (this.selectedRoleId) this.duplicate(this.selectedRoleId); }

  private duplicate(roleId: string): void {
    try {
      const next = duplicateCombatLabParticipant(this.options.draft.getExperiment(), roleId);
      this.options.draft.replaceExperiment(next);
      this.selectedRoleId = next.roles[next.roles.length - 1]?.roleId ?? roleId;
      this.options.onExperimentChanged(next);
      this.show('Создана независимая копия бойца.', false);
      this.refresh();
    } catch (error) { this.fail(message(error, 'Не удалось создать копию бойца.')); }
  }

  private remove(roleId: string): void {
    const experiment = this.options.draft.getExperiment();
    const references = collectCombatLabParticipantProgramReferences(experiment, roleId);
    const role = experiment.roles.find((candidate) => candidate.roleId === roleId);
    if (!role) return;
    let mode: 'block_if_referenced' | 'remove_with_program_references' = 'block_if_referenced';
    if (references.length > 0) {
      const details = references.slice(0, 12).map((item) => `• ${item.path}: ${item.descriptionRu}`).join('\n');
      const accepted = window.confirm(`Боец «${role.titleRu}» используется в программе:\n\n${details}\n\nУдалить бойца вместе со связанными действиями и условиями?`);
      if (!accepted) return;
      mode = 'remove_with_program_references';
    } else if (!window.confirm(`Удалить бойца «${role.titleRu}» из начальной сцены?`)) return;
    try {
      const next = removeCombatLabParticipant(experiment, roleId, mode);
      this.options.draft.replaceExperiment(next);
      this.selectedRoleId = next.roles[0]?.roleId ?? null;
      this.options.onExperimentChanged(next);
      this.show('Боец удалён.', false);
      this.refresh();
    } catch (error) { this.fail(message(error, 'Не удалось удалить бойца.')); }
  }

  private show(messageRu: string, error: boolean): void { this.message.textContent = messageRu; this.message.classList.toggle('is-error', error); }
  private fail(messageRu: string): void { this.options.onError(messageRu); this.show(messageRu, true); }
}

function facts(...items: readonly (readonly [string, string])[]): HTMLElement { const root = document.createElement('dl'); root.className = 'combat-lab-participant-card__facts'; for (const [label, value] of items) { const term = document.createElement('dt'); term.textContent = label; const description = document.createElement('dd'); description.textContent = value; root.append(term, description); } return root; }
function actions(...children: HTMLElement[]): HTMLElement { const root = document.createElement('div'); root.className = 'combat-lab-row'; root.append(...children); return root; }
function button(label: string, onClick: () => void, className = ''): HTMLButtonElement { const result = document.createElement('button'); result.type = 'button'; result.textContent = label; result.className = className; result.addEventListener('click', onClick); return result; }
function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] { const result = document.createElement(tag); result.className = className; result.textContent = value; return result; }
function postureLabel(posture: string): string { return posture === 'prone' ? 'Лёжа' : posture === 'crouched' ? 'Пригнувшись' : 'Стоя'; }
function message(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }
