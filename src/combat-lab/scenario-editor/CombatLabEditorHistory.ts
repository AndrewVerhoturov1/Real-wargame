import {
  COMBAT_LAB_EXPERIMENT_LIMITS_V1,
  type CombatLabExperimentV1,
} from '../../core/testing/combat-lab/experiment';

export class CombatLabEditorHistory {
  private readonly past: CombatLabExperimentV1[] = [];
  private readonly future: CombatLabExperimentV1[] = [];
  private current: CombatLabExperimentV1 | null;

  constructor(initial: CombatLabExperimentV1 | null = null) {
    this.current = initial;
  }

  execute(next: CombatLabExperimentV1): void {
    if (this.current) {
      this.past.push(this.current);
      if (this.past.length > COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumUndoStates) this.past.shift();
    }
    this.current = next;
    this.future.length = 0;
  }

  undo(): CombatLabExperimentV1 | null {
    const previous = this.past.pop();
    if (!previous) return null;
    if (this.current) this.future.push(this.current);
    this.current = previous;
    return previous;
  }

  redo(): CombatLabExperimentV1 | null {
    const next = this.future.pop();
    if (!next) return null;
    if (this.current) {
      this.past.push(this.current);
      if (this.past.length > COMBAT_LAB_EXPERIMENT_LIMITS_V1.maximumUndoStates) this.past.shift();
    }
    this.current = next;
    return next;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
    this.current = null;
  }

  get undoDepth(): number {
    return this.past.length;
  }

  get redoDepth(): number {
    return this.future.length;
  }
}
