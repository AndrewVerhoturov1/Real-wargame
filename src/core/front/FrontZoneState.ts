import type { GridPosition } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';

export type TerritoryKind = 'friendly' | 'neutral' | 'enemy';

export interface FrontZoneRuntimeState {
  visible: boolean;
  friendlyBoundaryX: number;
  enemyBoundaryX: number;
}

export interface TerritoryContext {
  kind: TerritoryKind;
  labelRu: string;
  safety: number;
}

const runtimeByState = new WeakMap<SimulationState, FrontZoneRuntimeState>();

export function getFrontZoneState(state: SimulationState): FrontZoneRuntimeState {
  let runtime = runtimeByState.get(state);
  if (!runtime) {
    const friendlyBoundaryX = clampBoundary(Math.round(state.map.width / 3), state.map.width);
    const enemyBoundaryX = clampBoundary(Math.round((state.map.width * 2) / 3), state.map.width);
    runtime = normalizeBoundaries(state.map.width, {
      visible: true,
      friendlyBoundaryX,
      enemyBoundaryX,
    });
    runtimeByState.set(state, runtime);
  }
  return runtime;
}

export function setFrontZoneBoundaries(
  state: SimulationState,
  friendlyBoundaryX: number,
  enemyBoundaryX: number,
): FrontZoneRuntimeState {
  const current = getFrontZoneState(state);
  const next = normalizeBoundaries(state.map.width, {
    ...current,
    friendlyBoundaryX,
    enemyBoundaryX,
  });
  Object.assign(current, next);
  return current;
}

export function setFrontZoneVisibility(state: SimulationState, visible: boolean): boolean {
  const runtime = getFrontZoneState(state);
  runtime.visible = visible;
  return runtime.visible;
}

export function toggleFrontZoneVisibility(state: SimulationState): boolean {
  return setFrontZoneVisibility(state, !getFrontZoneState(state).visible);
}

export function getTerritoryAtPosition(
  state: SimulationState,
  position: Pick<GridPosition, 'x'>,
): TerritoryContext {
  const runtime = getFrontZoneState(state);
  if (position.x < runtime.friendlyBoundaryX) {
    return { kind: 'friendly', labelRu: 'Своя территория', safety: 80 };
  }
  if (position.x < runtime.enemyBoundaryX) {
    return { kind: 'neutral', labelRu: 'Серая зона', safety: 50 };
  }
  return { kind: 'enemy', labelRu: 'Вражеская территория', safety: 20 };
}

function normalizeBoundaries(
  mapWidth: number,
  value: FrontZoneRuntimeState,
): FrontZoneRuntimeState {
  const maxBoundary = Math.max(2, mapWidth - 1);
  let friendlyBoundaryX = clampBoundary(value.friendlyBoundaryX, mapWidth);
  let enemyBoundaryX = clampBoundary(value.enemyBoundaryX, mapWidth);

  if (friendlyBoundaryX >= enemyBoundaryX) {
    if (friendlyBoundaryX >= maxBoundary) {
      friendlyBoundaryX = Math.max(1, maxBoundary - 1);
      enemyBoundaryX = maxBoundary;
    } else {
      enemyBoundaryX = Math.min(maxBoundary, friendlyBoundaryX + 1);
    }
  }

  return {
    visible: value.visible,
    friendlyBoundaryX,
    enemyBoundaryX,
  };
}

function clampBoundary(value: number, mapWidth: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : 1;
  return Math.max(1, Math.min(Math.max(2, mapWidth - 1), rounded));
}
