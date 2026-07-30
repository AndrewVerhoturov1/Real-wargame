import { selectUnit, type SimulationState } from '../../core/simulation/SimulationState';
import {
  combatLabSelectionsEqual,
  type CombatLabSelectedEntityV1,
  type CombatLabSelectionListenerV1,
} from './CombatLabSelectionTypes';

export interface CombatLabSelectionControllerOptionsV1 {
  readonly state: SimulationState;
  readonly resolveParticipantByUnitId: (
    unitId: string,
  ) => Extract<CombatLabSelectedEntityV1, { readonly kind: 'participant' }> | null;
}

export interface CombatLabSelectionControllerV1 {
  get(): CombatLabSelectedEntityV1;
  select(selection: CombatLabSelectedEntityV1): void;
  subscribe(listener: CombatLabSelectionListenerV1): () => void;
}

export class CombatLabSelectionController implements CombatLabSelectionControllerV1 {
  private readonly listeners = new Set<CombatLabSelectionListenerV1>();
  private selection: CombatLabSelectedEntityV1 = Object.freeze({ kind: 'none' });
  private lastObservedSelectedUnitId: string | null;
  private destroyed = false;

  private constructor(private readonly options: CombatLabSelectionControllerOptionsV1) {
    this.lastObservedSelectedUnitId = options.state.selectedUnitId;
    if (this.lastObservedSelectedUnitId) {
      this.selection = this.resolveStateSelection(this.lastObservedSelectedUnitId);
    }
  }

  static create(options: CombatLabSelectionControllerOptionsV1): CombatLabSelectionController {
    return new CombatLabSelectionController(options);
  }

  get(): CombatLabSelectedEntityV1 {
    return this.selection;
  }

  select(selection: CombatLabSelectedEntityV1): void {
    if (this.destroyed) return;
    const normalized = freezeSelection(selection);
    this.synchronizeProductionSelection(normalized);
    if (combatLabSelectionsEqual(this.selection, normalized)) return;
    this.selection = normalized;
    this.publish();
  }

  syncFromState(): void {
    if (this.destroyed) return;
    const selectedUnitId = this.options.state.selectedUnitId;
    if (selectedUnitId === this.lastObservedSelectedUnitId) return;
    this.lastObservedSelectedUnitId = selectedUnitId;
    const next = this.resolveStateSelection(selectedUnitId);
    if (combatLabSelectionsEqual(this.selection, next)) return;
    this.selection = next;
    this.publish();
  }

  subscribe(listener: CombatLabSelectionListenerV1): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
  }

  private synchronizeProductionSelection(selection: CombatLabSelectedEntityV1): void {
    const selectedUnitId = selection.kind === 'participant' ? selection.unitId : null;
    selectUnit(this.options.state, selectedUnitId);
    this.lastObservedSelectedUnitId = selectedUnitId;
  }

  private resolveStateSelection(unitId: string | null): CombatLabSelectedEntityV1 {
    if (!unitId) return Object.freeze({ kind: 'none' });
    const participant = this.options.resolveParticipantByUnitId(unitId);
    return participant ? freezeSelection(participant) : Object.freeze({ kind: 'none' });
  }

  private publish(): void {
    for (const listener of [...this.listeners]) listener(this.selection);
  }
}

function freezeSelection(selection: CombatLabSelectedEntityV1): CombatLabSelectedEntityV1 {
  switch (selection.kind) {
    case 'participant':
      return Object.freeze({ kind: 'participant', roleId: selection.roleId, unitId: selection.unitId });
    case 'marker':
      return Object.freeze({ kind: 'marker', markerId: selection.markerId });
    case 'scene':
      return Object.freeze({ kind: 'scene' });
    case 'none':
      return Object.freeze({ kind: 'none' });
  }
}
