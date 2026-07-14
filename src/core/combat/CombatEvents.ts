import type { SimulationState } from '../simulation/SimulationState';
import type { BallisticPoint3, HitZone } from './UnitHitShapes';

export type CombatEvent =
  | {
      id: string;
      kind: 'shot_fired';
      dueSeconds: number;
      shotId: string;
      shooterId: string;
      weaponId: string;
      origin: BallisticPoint3;
    }
  | {
      id: string;
      kind: 'projectile_impact';
      dueSeconds: number;
      shotId: string;
      shooterId: string;
      hitType: 'none' | 'terrain' | 'object' | 'unit';
      impactPoint: BallisticPoint3;
      hitObjectId?: string;
      hitUnitId?: string;
      hitZone?: HitZone;
      energyJoules: number;
    }
  | {
      id: string;
      kind: 'unit_hit';
      dueSeconds: number;
      shotId: string;
      shooterId: string;
      targetId: string;
      zone: HitZone;
      energyJoules: number;
    };

const eventsByState = new WeakMap<SimulationState, CombatEvent[]>();
const historyByState = new WeakMap<SimulationState, CombatEvent[]>();

export function queueCombatEvent(state: SimulationState, event: CombatEvent): void {
  const events = eventsByState.get(state) ?? [];
  events.push(cloneEvent(event));
  events.sort((left, right) => left.dueSeconds - right.dueSeconds || left.id.localeCompare(right.id));
  eventsByState.set(state, events);
}

export function drainDueCombatEvents(state: SimulationState, nowSeconds = state.simulationTimeSeconds): CombatEvent[] {
  const events = eventsByState.get(state) ?? [];
  const due: CombatEvent[] = [];
  const future: CombatEvent[] = [];
  for (const event of events) {
    if (event.dueSeconds <= nowSeconds + 0.000001) due.push(event);
    else future.push(event);
  }
  if (future.length > 0) eventsByState.set(state, future);
  else eventsByState.delete(state);
  if (due.length > 0) {
    const history = historyByState.get(state) ?? [];
    history.push(...due.map(cloneEvent));
    if (history.length > 200) history.splice(0, history.length - 200);
    historyByState.set(state, history);
  }
  return due;
}

export function getPendingCombatEvents(state: SimulationState): readonly CombatEvent[] {
  return eventsByState.get(state) ?? [];
}

export function getCombatEventHistory(state: SimulationState): readonly CombatEvent[] {
  return historyByState.get(state) ?? [];
}

export function clearCombatEvents(state: SimulationState): void {
  eventsByState.delete(state);
  historyByState.delete(state);
}

function cloneEvent<T extends CombatEvent>(event: T): T {
  if ('origin' in event) return { ...event, origin: { ...event.origin } } as T;
  if ('impactPoint' in event) return { ...event, impactPoint: { ...event.impactPoint } } as T;
  return { ...event };
}
