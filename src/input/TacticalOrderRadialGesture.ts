import type { GridPosition } from '../core/geometry';
import type { TacticalOrderPresetId } from '../core/orders/TacticalOrderIntent';

export const TACTICAL_ORDER_HOLD_DELAY_MS = 240;
export const TACTICAL_ORDER_CENTER_RADIUS_PX = 38;
export const TACTICAL_ORDER_INNER_RADIUS_PX = 46;
export const TACTICAL_ORDER_OUTER_RADIUS_PX = 152;
export const TACTICAL_ORDER_VIEWPORT_MARGIN_PX = 14;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export type TacticalOrderGesturePhase = 'pending' | 'open' | 'cancelled';
export type TacticalOrderGestureCancelReason = 'escape' | 'pointer_cancel' | 'pointer_capture_lost' | 'pointer_leave' | 'destroy';

export interface TacticalOrderGestureState {
  readonly phase: TacticalOrderGesturePhase;
  readonly anchorScreen: ScreenPoint;
  readonly targetGrid: GridPosition;
  readonly startedAtMs: number;
  readonly currentScreen: ScreenPoint;
  readonly highlightedPresetId: TacticalOrderPresetId | null;
  readonly cancelReason?: TacticalOrderGestureCancelReason;
}

export type TacticalOrderGestureRelease =
  | { readonly kind: 'quick_move' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'issue'; readonly presetId: TacticalOrderPresetId };

export function beginTacticalOrderGesture(
  anchorScreen: ScreenPoint,
  targetGrid: GridPosition,
  startedAtMs: number,
): TacticalOrderGestureState {
  return {
    phase: 'pending',
    anchorScreen: { ...anchorScreen },
    targetGrid: { ...targetGrid },
    startedAtMs,
    currentScreen: { ...anchorScreen },
    highlightedPresetId: null,
  };
}

export function updateTacticalOrderGesture(
  state: TacticalOrderGestureState,
  currentScreen: ScreenPoint,
  nowMs: number,
): TacticalOrderGestureState {
  if (state.phase === 'cancelled') return state;
  const phase = state.phase === 'open' || nowMs - state.startedAtMs >= TACTICAL_ORDER_HOLD_DELAY_MS
    ? 'open'
    : 'pending';
  return {
    ...state,
    phase,
    currentScreen: { ...currentScreen },
    highlightedPresetId: phase === 'open'
      ? resolveTacticalOrderPresetAtPoint(state.anchorScreen, currentScreen)
      : null,
  };
}

export function releaseTacticalOrderGesture(
  state: TacticalOrderGestureState,
  currentScreen: ScreenPoint,
  nowMs: number,
): TacticalOrderGestureRelease {
  if (state.phase === 'cancelled') return { kind: 'cancel' };
  const updated = updateTacticalOrderGesture(state, currentScreen, nowMs);
  if (updated.phase === 'pending') return { kind: 'quick_move' };
  return updated.highlightedPresetId
    ? { kind: 'issue', presetId: updated.highlightedPresetId }
    : { kind: 'cancel' };
}

export function cancelTacticalOrderGesture(
  state: TacticalOrderGestureState,
  reason: TacticalOrderGestureCancelReason,
): TacticalOrderGestureState {
  return {
    ...state,
    phase: 'cancelled',
    highlightedPresetId: null,
    cancelReason: reason,
  };
}

export function resolveTacticalOrderPresetAtPoint(
  anchor: ScreenPoint,
  point: ScreenPoint,
): TacticalOrderPresetId | null {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const radius = Math.hypot(dx, dy);
  if (radius < TACTICAL_ORDER_CENTER_RADIUS_PX) return null;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const sectors: ReadonlyArray<readonly [TacticalOrderPresetId, number]> = [
    ['recon', -90],
    ['assault', 30],
    ['move', 150],
  ];
  return sectors
    .map(([presetId, center]) => ({ presetId, distance: angularDistanceDegrees(angle, center) }))
    .sort((left, right) => left.distance - right.distance)[0]?.presetId ?? null;
}

export function clampTacticalOrderMenuCenter(
  anchor: ScreenPoint,
  viewportWidth: number,
  viewportHeight: number,
): ScreenPoint {
  const edge = TACTICAL_ORDER_OUTER_RADIUS_PX + TACTICAL_ORDER_VIEWPORT_MARGIN_PX;
  return {
    x: clamp(anchor.x, edge, Math.max(edge, viewportWidth - edge)),
    y: clamp(anchor.y, edge, Math.max(edge, viewportHeight - edge)),
  };
}

function angularDistanceDegrees(left: number, right: number): number {
  const delta = ((left - right + 540) % 360) - 180;
  return Math.abs(delta);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
