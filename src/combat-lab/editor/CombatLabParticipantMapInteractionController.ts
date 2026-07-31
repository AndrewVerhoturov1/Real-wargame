import type { SimulationState } from '../../core/simulation/SimulationState';
import type { CombatLabWorkspaceServices } from '../CombatLabWorkspaceServices';
import type { CombatLabMapToolModeV1, CombatLabMapToolPointerV1 } from '../map-tools/CombatLabMapToolTypes';
import {
  createCombatLabParticipantFacingContributor,
  createCombatLabParticipantMapPreviewEventPort,
  createCombatLabParticipantPlacementContributor,
  type CombatLabParticipantFacingInputV1,
  type CombatLabParticipantFacingTransactionV1,
  type CombatLabParticipantPlacementInputV1,
  type CombatLabParticipantPlacementTransactionV1,
} from './CombatLabParticipantMapTools';
import './combat-lab-participant-map-action-bar.css';

export interface CombatLabParticipantMapInteractionControllerOptionsV1 {
  readonly root: HTMLElement;
  readonly state: SimulationState;
  readonly services: CombatLabWorkspaceServices;
  readonly canvas?: HTMLCanvasElement | null;
}

export type CombatLabParticipantMapCompletionV1 = 'confirmed_or_cancelled';
export type CombatLabParticipantMapCompletionListenerV1 = (
  result: CombatLabParticipantMapCompletionV1,
) => void;

export class CombatLabParticipantMapInteractionController {
  private readonly canvas: HTMLCanvasElement;
  private readonly actionBar = document.createElement('div');
  private readonly actionBarStatus = document.createElement('span');
  private readonly removePlacementContributor: () => void;
  private readonly removeFacingContributor: () => void;
  private readonly removeModeListener: () => void;
  private readonly completionListeners = new Set<CombatLabParticipantMapCompletionListenerV1>();
  private activePlacement: CombatLabParticipantPlacementTransactionV1 | null = null;
  private activeFacing: CombatLabParticipantFacingTransactionV1 | null = null;
  private facingDragActive = false;
  private previousMode: CombatLabMapToolModeV1;
  private destroyed = false;

  private constructor(private readonly options: CombatLabParticipantMapInteractionControllerOptionsV1) {
    const canvas = options.canvas ?? document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!canvas) throw new Error('Не найдено поле карты для размещения бойца.');
    this.canvas = canvas;
    this.previousMode = options.services.mapTools.getMode();
    this.installActionBar();
    const preview = createCombatLabParticipantMapPreviewEventPort(window);
    this.removePlacementContributor = options.services.mapTools.registerContributor(
      createCombatLabParticipantPlacementContributor({
        metersPerCell: options.state.map.metersPerCell,
        participantMutations: options.services.participantMutations,
        preview,
        onTransactionCreated: (transaction) => {
          this.activePlacement = transaction;
          this.activeFacing = null;
        },
      }),
    );
    this.removeFacingContributor = options.services.mapTools.registerContributor(
      createCombatLabParticipantFacingContributor({
        metersPerCell: options.state.map.metersPerCell,
        participantMutations: options.services.participantMutations,
        preview,
        onTransactionCreated: (transaction) => {
          this.activeFacing = transaction;
          this.activePlacement = null;
        },
      }),
    );
    this.removeModeListener = options.services.mapTools.subscribe(this.handleModeChanged);
    // Bubble phase is intentional: the production board updates mouseGridPosition first.
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.renderActionBar(this.previousMode);
  }

  static create(options: CombatLabParticipantMapInteractionControllerOptionsV1): CombatLabParticipantMapInteractionController {
    const existing = controllersByRoot.get(options.root);
    if (existing && !existing.destroyed) return existing;
    const controller = new CombatLabParticipantMapInteractionController(options);
    controllersByRoot.set(options.root, controller);
    return controller;
  }

  beginPlacement(input: CombatLabParticipantPlacementInputV1): void {
    this.ensureAlive();
    this.options.services.mapTools.begin('place_participant', input);
    this.canvas.dataset.combatLabParticipantTool = 'placement';
  }

  beginFacing(input: CombatLabParticipantFacingInputV1): void {
    this.ensureAlive();
    this.options.services.mapTools.begin('rotate_participant', input);
    this.canvas.dataset.combatLabParticipantTool = 'facing';
  }

  confirm(): void {
    if (this.destroyed) return;
    this.options.services.mapTools.confirm();
  }

  cancel(): void {
    if (this.destroyed) return;
    this.options.services.mapTools.cancel();
  }

  subscribeCompletion(listener: CombatLabParticipantMapCompletionListenerV1): () => void {
    this.completionListeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.completionListeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.services.mapTools.cancel();
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    delete this.canvas.dataset.combatLabParticipantTool;
    this.removeModeListener();
    this.removeFacingContributor();
    this.removePlacementContributor();
    this.actionBar.remove();
    this.completionListeners.clear();
    if (controllersByRoot.get(this.options.root) === this) controllersByRoot.delete(this.options.root);
  }

  private installActionBar(): void {
    this.actionBar.className = 'combat-lab-participant-map-action-bar';
    this.actionBar.hidden = true;
    this.actionBar.setAttribute('role', 'group');
    this.actionBar.setAttribute('aria-label', 'Действия временного режима карты');
    this.actionBarStatus.className = 'combat-lab-participant-map-action-bar__status';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = 'Подтвердить';
    confirm.className = 'combat-lab-participant-map-action-bar__confirm';
    confirm.addEventListener('click', () => this.confirm());
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Отменить';
    cancel.addEventListener('click', () => this.cancel());
    this.actionBar.append(this.actionBarStatus, confirm, cancel);
    this.options.root.append(this.actionBar);
  }

  private renderActionBar(mode: CombatLabMapToolModeV1): void {
    const participantMode = mode === 'place_participant' || mode === 'rotate_participant';
    this.actionBar.hidden = !participantMode;
    if (!participantMode) {
      delete this.actionBar.dataset.combatLabParticipantMapMode;
      this.actionBarStatus.textContent = '';
      return;
    }
    this.actionBar.dataset.combatLabParticipantMapMode = mode;
    this.actionBarStatus.textContent = mode === 'place_participant'
      ? 'Размещение бойца'
      : 'Направление бойца';
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const pointer = this.resolvePointer(event);
    if (!pointer) return;
    if (this.activeFacing && this.facingDragActive) this.activeFacing.preview(pointer);
    else this.options.services.mapTools.preview(pointer);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || (!this.activePlacement && !this.activeFacing)) return;
    const pointer = this.resolvePointer(event);
    if (!pointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.canvas.setPointerCapture?.(event.pointerId);
    if (this.activePlacement) this.activePlacement.pin(pointer);
    if (this.activeFacing) {
      this.facingDragActive = true;
      this.activeFacing.preview(pointer);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.activeFacing || !this.facingDragActive) return;
    const pointer = this.resolvePointer(event);
    if (pointer) this.activeFacing.pin(pointer);
    this.facingDragActive = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePointerCancel = (): void => {
    this.facingDragActive = false;
  };

  private readonly handleModeChanged = (mode: CombatLabMapToolModeV1): void => {
    this.renderActionBar(mode);
    const leftTemporaryMode = (this.previousMode === 'place_participant' || this.previousMode === 'rotate_participant')
      && mode !== 'place_participant'
      && mode !== 'rotate_participant';
    this.previousMode = mode;
    if (!leftTemporaryMode) return;
    this.activePlacement = null;
    this.activeFacing = null;
    this.facingDragActive = false;
    delete this.canvas.dataset.combatLabParticipantTool;
    for (const listener of [...this.completionListeners]) listener('confirmed_or_cancelled');
  };

  private resolvePointer(event: PointerEvent): CombatLabMapToolPointerV1 | null {
    const grid = this.options.state.mouseGridPosition;
    if (grid) {
      return {
        xMetres: grid.x * this.options.state.map.metersPerCell,
        yMetres: grid.y * this.options.state.map.metersPerCell,
      };
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const xCells = ((event.clientX - rect.left) / rect.width) * this.options.state.map.width;
    const yCells = ((event.clientY - rect.top) / rect.height) * this.options.state.map.height;
    return {
      xMetres: xCells * this.options.state.map.metersPerCell,
      yMetres: yCells * this.options.state.map.metersPerCell,
    };
  }

  private ensureAlive(): void {
    if (this.destroyed) throw new Error('Инструмент размещения бойца уже отключён.');
  }
}

const controllersByRoot = new WeakMap<HTMLElement, CombatLabParticipantMapInteractionController>();

export function getCombatLabParticipantMapInteractionController(
  root: HTMLElement,
): CombatLabParticipantMapInteractionController | null {
  return controllersByRoot.get(root) ?? null;
}
