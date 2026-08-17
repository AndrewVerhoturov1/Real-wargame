import type { ScreenPoint } from './TacticalOrderRadialGesture';

export const ENTITY_CONTEXT_DRAG_THRESHOLD_PX = 4;

export function entityContextDragExceeded(anchor: ScreenPoint, current: ScreenPoint): boolean {
  return Math.hypot(current.x - anchor.x, current.y - anchor.y) >= ENTITY_CONTEXT_DRAG_THRESHOLD_PX;
}

export type EntityContextPendingRelease = 'context-menu' | 'tactical-release';

export function resolveEntityContextPendingRelease(
  hasTarget: boolean,
  dragged: boolean,
): EntityContextPendingRelease {
  return hasTarget && !dragged ? 'context-menu' : 'tactical-release';
}
