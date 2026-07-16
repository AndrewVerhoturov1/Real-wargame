import type { GridPosition } from '../core/geometry';
import type { TacticalOrderPresetId } from '../core/orders/TacticalOrderIntent';

export const TACTICAL_ORDER_HOLD_DELAY_MS = 240;
export const TACTICAL_ORDER_CENTER_RADIUS_PX = 25;
export const TACTICAL_ORDER_INNER_RADIUS_PX = 34;
export const TACTICAL_ORDER_OUTER_RADIUS_PX = 104;
export const TACTICAL_ORDER_VIEWPORT_MARGIN_PX = 12;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export type TacticalOrderGesturePhase = 'pending' | 'open' | 'cancelled';
export type TacticalOrderGestureCancelReason = 'escape' | 'pointer_cancel' | 'pointer_capture_lost' | 'pointer_leave' | 'destroy';

export interface TacticalOrderGestureState {
  readonly phase: TacticalOrderGesturePhase;
  readonly anchorScreen: ScreenPoint;
  readonly menuCenterScreen: ScreenPoint | null;
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
    menuCenterScreen: null,
    targetGrid: { ...targetGrid },
    startedAtMs,
    currentScreen: { ...anchorScreen },
    highlightedPresetId: null,
  };
}

export function openTacticalOrderGesture(
  state: TacticalOrderGestureState,
  menuCenterScreen: ScreenPoint,
  currentScreen: ScreenPoint,
  nowMs: number,
): TacticalOrderGestureState {
  if (state.phase === 'cancelled') return state;
  if (nowMs - state.startedAtMs < TACTICAL_ORDER_HOLD_DELAY_MS) {
    return updateTacticalOrderGesture(state, currentScreen, nowMs);
  }
  return {
    ...state,
    phase: 'open',
    menuCenterScreen: { ...menuCenterScreen },
    currentScreen: { ...currentScreen },
    highlightedPresetId: resolveTacticalOrderPresetAtPoint(menuCenterScreen, currentScreen),
  };
}

export function updateTacticalOrderGesture(
  state: TacticalOrderGestureState,
  currentScreen: ScreenPoint,
  _nowMs: number,
): TacticalOrderGestureState {
  if (state.phase === 'cancelled') return state;
  if (state.phase !== 'open') {
    return {
      ...state,
      currentScreen: { ...currentScreen },
      highlightedPresetId: null,
    };
  }
  const menuCenter = state.menuCenterScreen ?? state.anchorScreen;
  return {
    ...state,
    currentScreen: { ...currentScreen },
    highlightedPresetId: resolveTacticalOrderPresetAtPoint(menuCenter, currentScreen),
  };
}

export function releaseTacticalOrderGesture(
  state: TacticalOrderGestureState,
  currentScreen: ScreenPoint,
  _nowMs: number,
): TacticalOrderGestureRelease {
  if (state.phase === 'cancelled') return { kind: 'cancel' };
  if (state.phase === 'pending') return { kind: 'quick_move' };
  const menuCenter = state.menuCenterScreen ?? state.anchorScreen;
  const presetId = resolveTacticalOrderPresetAtPoint(menuCenter, currentScreen);
  return presetId ? { kind: 'issue', presetId } : { kind: 'cancel' };
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
  menuCenter: ScreenPoint,
  point: ScreenPoint,
): TacticalOrderPresetId | null {
  const dx = point.x - menuCenter.x;
  const dy = point.y - menuCenter.y;
  const radius = Math.hypot(dx, dy);
  if (radius < TACTICAL_ORDER_CENTER_RADIUS_PX) return null;
  if (radius < TACTICAL_ORDER_INNER_RADIUS_PX || radius > TACTICAL_ORDER_OUTER_RADIUS_PX) return null;

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
