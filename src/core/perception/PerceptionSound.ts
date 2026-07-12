import type { GridPosition } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';

export type PerceptionSoundKind = 'rifle_shot' | 'automatic_fire' | 'explosion' | 'movement';

export interface PerceptionSoundEvent {
  id: string;
  kind: PerceptionSoundKind;
  sourceId: string | null;
  labelRu?: string;
  position: GridPosition;
  loudness: number;
  createdSeconds: number;
  durationSeconds: number;
}

const soundsByState = new WeakMap<SimulationState, PerceptionSoundEvent[]>();

export function emitPerceptionSound(state: SimulationState, event: PerceptionSoundEvent): void {
  const events = soundsByState.get(state) ?? [];
  const normalized: PerceptionSoundEvent = {
    ...event,
    position: { ...event.position },
    loudness: Math.max(0, Math.min(2, event.loudness)),
    durationSeconds: Math.max(0.05, event.durationSeconds),
  };
  const existingIndex = events.findIndex((item) => item.id === normalized.id);
  if (existingIndex >= 0) events[existingIndex] = normalized;
  else events.push(normalized);
  soundsByState.set(state, events);
}

export function getActivePerceptionSounds(state: SimulationState): readonly PerceptionSoundEvent[] {
  prunePerceptionSounds(state);
  return soundsByState.get(state) ?? [];
}

export function prunePerceptionSounds(state: SimulationState): void {
  const events = soundsByState.get(state);
  if (!events) return;
  const now = state.simulationTimeSeconds;
  const next = events.filter((event) => now <= event.createdSeconds + event.durationSeconds);
  if (next.length > 0) soundsByState.set(state, next);
  else soundsByState.delete(state);
}

export function soundBaseRangeMeters(kind: PerceptionSoundKind): number {
  switch (kind) {
    case 'automatic_fire': return 500;
    case 'explosion': return 900;
    case 'movement': return 45;
    case 'rifle_shot':
    default: return 350;
  }
}
