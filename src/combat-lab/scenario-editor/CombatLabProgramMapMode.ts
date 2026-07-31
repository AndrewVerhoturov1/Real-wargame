import type { CombatLabMapToolCoordinator } from '../map-tools/CombatLabMapToolCoordinator';
import type { CombatLabPersistentMapToolModeV1 } from '../map-tools/CombatLabMapToolTypes';

export type CombatLabProgramMapModeV1 = Extract<
  CombatLabPersistentMapToolModeV1,
  'program_authoring' | 'manual_control'
>;

export type CombatLabProgramMapModeListenerV1 = (mode: CombatLabProgramMapModeV1) => void;

export class CombatLabProgramMapMode {
  private readonly listeners = new Set<CombatLabProgramMapModeListenerV1>();
  private readonly unsubscribe: () => void;
  private destroyed = false;

  constructor(private readonly coordinator: Pick<
    CombatLabMapToolCoordinator,
    'getPersistentMode' | 'setPersistentMode' | 'subscribe'
  >) {
    this.unsubscribe = coordinator.subscribe((mode) => {
      if (mode !== 'program_authoring' && mode !== 'manual_control') return;
      this.publish(mode);
    });
  }

  get(): CombatLabProgramMapModeV1 {
    const mode = this.coordinator.getPersistentMode();
    return mode === 'manual_control' ? 'manual_control' : 'program_authoring';
  }

  set(mode: CombatLabProgramMapModeV1): void {
    if (this.destroyed || this.get() === mode) return;
    this.coordinator.setPersistentMode(mode);
  }

  subscribe(listener: CombatLabProgramMapModeListenerV1): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.listeners.clear();
  }

  private publish(mode: CombatLabProgramMapModeV1): void {
    if (this.destroyed) return;
    for (const listener of [...this.listeners]) listener(mode);
  }
}
