import type {
  CombatLabExperimentV1,
  CombatLabScenarioRuntimeSnapshotV1,
} from '../../core/testing/combat-lab/experiment';
import {
  listCombatLabActionDescriptors,
  type CombatLabActionDescriptorV1,
} from './CombatLabActionCatalog';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';
import { createCombatLabScenarioStepFromCatalog } from './CombatLabEditorFactories';
import type {
  CombatLabScenarioEditorCapabilitiesV1,
  CombatLabSelectedStepV1,
} from './CombatLabScenarioEditorTypes';
import { CombatLabStepCard } from './CombatLabStepCard';

export interface CombatLabTrackListOptions {
  readonly host: HTMLElement;
  readonly draft: CombatLabExperimentDraft;
  readonly capabilities?: CombatLabScenarioEditorCapabilitiesV1;
  readonly getRuntimeSnapshot: () => CombatLabScenarioRuntimeSnapshotV1 | null;
  readonly getSelectedStep: () => CombatLabSelectedStepV1 | null;
  readonly onSelectStep: (trackId: string, stepId: string) => void;
  readonly onEditStep: (trackId: string, stepId: string, returnFocusTo: HTMLElement) => void;
  readonly onDraftMutation: (mutation: () => void) => void;
  readonly onError: (messageRu: string) => void;
}

interface PointerReorderState {
  readonly trackId: string;
  readonly stepId: string;
  readonly pointerId: number;
  targetIndex: number;
}

export class CombatLabTrackList {
  readonly root = document.createElement('div');
  private readonly cards: CombatLabStepCard[] = [];
  private drag: PointerReorderState | null = null;
  private destroyed = false;

  constructor(private readonly options: CombatLabTrackListOptions) {
    this.root.className = 'combat-lab-track-list';
    options.host.append(this.root);
    window.addEventListener('pointermove', this.handlePointerMove, true);
    window.addEventListener('pointerup', this.handlePointerUp, true);
    window.addEventListener('pointercancel', this.handlePointerCancel, true);
    this.render();
  }

  render(): void {
    if (this.destroyed) return;
    this.clearCards();
    const experiment = this.options.draft.getExperiment();
    const runtime = this.options.getRuntimeSnapshot();
    const runtimeByStep = new Map(runtime?.steps.map((step) => [`${step.trackId}\u0000${step.stepId}`, step]) ?? []);
    const selected = this.options.getSelectedStep();
    const fragments: HTMLElement[] = [];

    for (const track of experiment.tracks) {
      const section = document.createElement('section');
      section.className = 'combat-lab-track';
      section.dataset.trackId = track.trackId;
      section.classList.toggle('is-disabled', !track.enabled);
      const heading = document.createElement('header');
      heading.className = 'combat-lab-track-header';
      const role = experiment.roles.find((candidate) => candidate.roleId === track.actorRoleId);
      heading.append(
        text('strong', '', track.titleRu),
        text('span', '', role?.titleRu ?? 'Исполнитель не назначен'),
      );
      section.append(heading);

      const steps = document.createElement('div');
      steps.className = 'combat-lab-track-steps';
      if (track.steps.length === 0) steps.append(text('div', 'combat-lab-track-empty', 'Дорожка пуста. Добавьте первое действие.'));
      track.steps.forEach((step, index) => {
        const runtimeStep = runtimeByStep.get(`${track.trackId}\u0000${step.stepId}`) ?? null;
        const card = new CombatLabStepCard({
          experiment,
          trackId: track.trackId,
          step,
          index,
          runtime: runtimeStep,
          selected: selected?.trackId === track.trackId && selected.stepId === step.stepId,
          onSelect: () => this.options.onSelectStep(track.trackId, step.stepId),
          onEdit: (returnFocusTo) => this.options.onEditStep(track.trackId, step.stepId, returnFocusTo),
          onDuplicate: () => this.mutate(() => {
            const duplicateId = this.options.draft.duplicateStep(track.trackId, step.stepId);
            this.options.onSelectStep(track.trackId, duplicateId);
          }),
          onToggleEnabled: () => this.mutate(() => this.options.draft.updateStep(track.trackId, step.stepId, { enabled: !step.enabled })),
          onDelete: () => this.mutate(() => this.options.draft.removeStep(track.trackId, step.stepId)),
          onMoveBy: (offset) => this.mutate(() => this.options.draft.moveStep(track.trackId, step.stepId, index + offset)),
          onBeginPointerReorder: (event) => this.beginPointerReorder(event, track.trackId, step.stepId, index),
        });
        this.cards.push(card);
        steps.append(card.root);
      });
      section.append(steps, this.createAddActionDetails(experiment, track.trackId, track.actorRoleId));
      fragments.push(section);
    }

    if (fragments.length === 0) fragments.push(text('div', 'combat-lab-editor-empty', 'Назначьте бойцов и создайте дорожку исполнителя.'));
    this.root.replaceChildren(...fragments);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.drag = null;
    window.removeEventListener('pointermove', this.handlePointerMove, true);
    window.removeEventListener('pointerup', this.handlePointerUp, true);
    window.removeEventListener('pointercancel', this.handlePointerCancel, true);
    this.clearCards();
    this.root.remove();
  }

  private createAddActionDetails(experiment: CombatLabExperimentV1, trackId: string, actorRoleId: string): HTMLElement {
    const details = document.createElement('details');
    details.className = 'combat-lab-track-add';
    details.append(text('summary', '', 'Добавить действие'));
    const grid = document.createElement('div');
    grid.className = 'combat-lab-action-palette';

    for (const descriptor of listCombatLabActionDescriptors()) {
      const availability = this.resolveAvailability(experiment, actorRoleId, descriptor);
      const markerMissing = descriptor.requiresMarker && experiment.markers.length === 0;
      const roleMissing = descriptor.requiresOtherRole && !experiment.roles.some((role) => role.roleId !== actorRoleId);
      const reason = markerMissing ? 'Сначала создайте метку на карте.' : roleMissing ? 'Нужен второй боец.' : availability.reasonRu;
      const enabled = availability.enabled && !markerMissing && !roleMissing;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = descriptor.labelRu;
      button.dataset.actionCatalogId = descriptor.id;
      button.disabled = !enabled;
      if (reason) button.title = reason;
      button.addEventListener('click', () => {
        this.mutate(() => {
          const step = createCombatLabScenarioStepFromCatalog(experiment, actorRoleId, descriptor.id, {
            markerId: descriptor.requiresMarker ? experiment.markers[0]?.markerId ?? null : null,
            targetRoleId: experiment.roles.find((role) => role.roleId !== actorRoleId)?.roleId ?? null,
          });
          this.options.draft.addStep(trackId, step);
          this.options.onSelectStep(trackId, step.stepId);
        });
        details.open = false;
      });
      grid.append(button);
    }
    details.append(grid);
    return details;
  }

  private resolveAvailability(
    experiment: CombatLabExperimentV1,
    actorRoleId: string,
    descriptor: CombatLabActionDescriptorV1,
  ): { enabled: boolean; reasonRu: string | null } {
    return this.options.capabilities?.resolveActionAvailability?.(experiment, actorRoleId, descriptor.actionKind, descriptor.fireMode)
      ?? { enabled: true, reasonRu: null };
  }

  private beginPointerReorder(event: PointerEvent, trackId: string, stepId: string, index: number): void {
    if (event.button !== 0 || this.destroyed) return;
    this.drag = { trackId, stepId, pointerId: event.pointerId, targetIndex: index };
    this.root.classList.add('is-reordering');
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-combat-lab-step-card]');
    if (!target || target.dataset.trackId !== this.drag.trackId) return;
    const index = Number(target.dataset.stepIndex);
    if (Number.isInteger(index)) this.drag.targetIndex = index;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag = this.drag;
    this.drag = null;
    this.root.classList.remove('is-reordering');
    this.mutate(() => this.options.draft.moveStep(drag.trackId, drag.stepId, drag.targetIndex));
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.root.classList.remove('is-reordering');
  };

  private mutate(mutation: () => void): void {
    try { this.options.onDraftMutation(mutation); }
    catch (error) { this.options.onError(error instanceof Error ? error.message : 'Не удалось изменить дорожку.'); }
  }

  private clearCards(): void {
    for (const card of this.cards) card.destroy();
    this.cards.length = 0;
  }
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
