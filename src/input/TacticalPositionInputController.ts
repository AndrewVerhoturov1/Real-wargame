import type { TacticalPositionKind } from '../core/ai/tactical/TacticalQuery';
import type { SimulationState } from '../core/simulation/SimulationState';
import {
  findVisibleTacticalPositionAt,
  getVisibleTacticalPositionById,
  recommendedPostureOf,
  selectVisibleTacticalPositionById,
} from '../core/tactical/SimulationTacticalPositionSelection';
import { issueTacticalPositionMoveOrderToSelectedUnit } from '../core/tactical/TacticalPositionOrders';
import { isTacticalPositionWorkspaceTabActive } from '../ui/TacticalPositionWorkspaceTab';

interface PendingMarkerPointer {
  readonly pointerId: number;
  readonly button: number;
  readonly candidateId: string;
}

export class TacticalPositionInputController {
  private attached = false;
  private pending: PendingMarkerPointer | null = null;

  constructor(private readonly state: SimulationState) {}

  attach(): void {
    if (this.attached) return;
    window.addEventListener('pointerdown', this.handlePointerDown, { capture: true });
    window.addEventListener('pointerup', this.handlePointerUp, { capture: true });
    window.addEventListener('pointercancel', this.handlePointerCancel, { capture: true });
    this.attached = true;
  }

  destroy(): void {
    if (!this.attached) return;
    window.removeEventListener('pointerdown', this.handlePointerDown, { capture: true });
    window.removeEventListener('pointerup', this.handlePointerUp, { capture: true });
    window.removeEventListener('pointercancel', this.handlePointerCancel, { capture: true });
    this.pending = null;
    this.attached = false;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.canHandle(event) || (event.button !== 0 && event.button !== 2)) return;
    const position = this.state.mouseGridPosition;
    if (!position) return;
    const candidate = findVisibleTacticalPositionAt(this.state, position);
    if (!candidate) return;

    this.pending = {
      pointerId: event.pointerId,
      button: event.button,
      candidateId: candidate.id,
    };
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const pending = this.pending;
    if (!pending || pending.pointerId !== event.pointerId || pending.button !== event.button) return;
    this.pending = null;
    const candidate = getVisibleTacticalPositionById(this.state, pending.candidateId);
    if (!candidate || !this.canHandle(event)) return;

    selectVisibleTacticalPositionById(this.state, candidate.id);
    if (event.button === 2) {
      const kind = canonicalKind(candidate.kind);
      const requestIdentity = cleanIdentity(candidate.requestIdentity);
      issueTacticalPositionMoveOrderToSelectedUnit(
        this.state,
        candidate.position,
        recommendedPostureOf(candidate),
        kind && requestIdentity
          ? {
              kind,
              requestIdentity,
              candidateId: candidate.id,
              recommendedFacingRadians: candidate.metrics.recommendedFacingRadians ?? null,
            }
          : null,
      );
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.pending?.pointerId !== event.pointerId) return;
    this.pending = null;
    event.stopImmediatePropagation();
  };

  private canHandle(event: PointerEvent): boolean {
    return event.target instanceof HTMLCanvasElement
      && !this.state.editor.enabled
      && isTacticalPositionWorkspaceTabActive(this.state)
      && this.state.selectedUnitId !== null;
  }
}

function canonicalKind(value: unknown): TacticalPositionKind | null {
  if (value === 'observation' || value === 'firing') return value;
  if (value === 'defense' || value === 'cover') return 'defense';
  return null;
}

function cleanIdentity(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
