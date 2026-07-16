import { distance, type GridPosition } from '../core/geometry';
import { worldToGrid } from '../core/map/MapModel';
import {
  issueRoutedMoveOrderToSelectedUnits,
  issueTacticalOrderToSelectedUnits,
} from '../core/orders/RoutedMoveOrders';
import { facingRadiansFromPoints } from '../core/orders/UnitFacingCommands';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getAiLabRuntime } from '../core/testing/AiLabRuntime';
import { getUnitCommandToolState, setRouteFacingDraft } from '../core/ui/RuntimeUiState';
import type { PixiTacticalBoardApp } from '../rendering/PixiApp';
import {
  beginTacticalOrderGesture,
  cancelTacticalOrderGesture,
  releaseTacticalOrderGesture,
  TACTICAL_ORDER_HOLD_DELAY_MS,
  updateTacticalOrderGesture,
  type ScreenPoint,
  type TacticalOrderGestureCancelReason,
  type TacticalOrderGestureState,
} from './TacticalOrderRadialGesture';
import { TacticalOrderRadialMenu, tacticalOrderPresetFromKeyboard } from './TacticalOrderRadialMenu';

const QUICK_MOVE_FACING_THRESHOLD_CELLS = 0.35;
const CAMERA_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);

interface BoardInternals {
  readonly app?: { readonly canvas?: HTMLCanvasElement };
  readonly camera?: {
    screenToWorld(event: { clientX: number; clientY: number }): { x: number; y: number };
  };
}

export function installTacticalOrderRadialInput(
  board: PixiTacticalBoardApp,
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const internals = board as unknown as BoardInternals;
  const canvas = internals.app?.canvas ?? document.querySelector<HTMLCanvasElement>('canvas');
  const camera = internals.camera;
  if (!canvas || !camera) throw new Error('Tactical order radial input requires the board canvas and camera.');

  const menu = new TacticalOrderRadialMenu();
  let pointerId: number | null = null;
  let gesture: TacticalOrderGestureState | null = null;
  let currentScreen: ScreenPoint | null = null;
  let currentGrid: GridPosition | null = null;
  let holdTimer: number | null = null;

  const eventGrid = (event: { clientX: number; clientY: number }): GridPosition => {
    return worldToGrid(state.map, camera.screenToWorld(event));
  };

  const clearTimer = (): void => {
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    holdTimer = null;
  };

  const close = (reason?: TacticalOrderGestureCancelReason): void => {
    clearTimer();
    if (gesture && reason) gesture = cancelTacticalOrderGesture(gesture, reason);
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
    gesture = null;
    currentScreen = null;
    currentGrid = null;
    menu.hide();
    setRouteFacingDraft(state, null);
    onChanged();
  };

  const openMenu = (): void => {
    if (!gesture || pointerId === null || gesture.phase !== 'pending') return;
    const now = performance.now();
    const point = currentScreen ?? gesture.anchorScreen;
    gesture = updateTacticalOrderGesture(gesture, point, Math.max(now, gesture.startedAtMs + TACTICAL_ORDER_HOLD_DELAY_MS));
    if (gesture.phase !== 'open') return;
    menu.show(gesture.anchorScreen, gesture.targetGrid);
    menu.updateHighlighted(gesture.highlightedPresetId);
    setRouteFacingDraft(state, null);
    onChanged();
  };

  const handleContextMenu = (event: MouseEvent): void => {
    if (!gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    if (state.editor.enabled || getAiLabRuntime(state).open) return;
    if (getUnitCommandToolState(state).turnToolActive) return;
    if (state.selectedUnitIds.length === 0) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    clearTimer();
    pointerId = event.pointerId;
    currentScreen = { x: event.clientX, y: event.clientY };
    currentGrid = eventGrid(event);
    gesture = beginTacticalOrderGesture(currentScreen, currentGrid, performance.now());
    canvas.setPointerCapture(pointerId);
    setRouteFacingDraft(state, {
      target: currentGrid,
      pointer: currentGrid,
      finalFacingRadians: null,
    });
    holdTimer = window.setTimeout(openMenu, TACTICAL_ORDER_HOLD_DELAY_MS);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId || !gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    currentScreen = { x: event.clientX, y: event.clientY };
    currentGrid = eventGrid(event);
    gesture = updateTacticalOrderGesture(gesture, currentScreen, performance.now());
    if (gesture.phase === 'open') {
      clearTimer();
      if (!menu.visible) menu.show(gesture.anchorScreen, gesture.targetGrid);
      menu.updateHighlighted(gesture.highlightedPresetId);
      setRouteFacingDraft(state, null);
    } else {
      const finalFacingRadians = distance(gesture.targetGrid, currentGrid) >= QUICK_MOVE_FACING_THRESHOLD_CELLS
        ? facingRadiansFromPoints(gesture.targetGrid, currentGrid)
        : null;
      setRouteFacingDraft(state, {
        target: gesture.targetGrid,
        pointer: currentGrid,
        finalFacingRadians,
      });
    }
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId || !gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = { x: event.clientX, y: event.clientY };
    const release = releaseTacticalOrderGesture(gesture, point, performance.now());
    const target = gesture.targetGrid;
    const releaseGrid = eventGrid(event);
    if (release.kind === 'quick_move') {
      const finalFacingRadians = distance(target, releaseGrid) >= QUICK_MOVE_FACING_THRESHOLD_CELLS
        ? facingRadiansFromPoints(target, releaseGrid) ?? undefined
        : undefined;
      issueRoutedMoveOrderToSelectedUnits(state, target, finalFacingRadians);
    } else if (release.kind === 'issue') {
      issueTacticalOrderToSelectedUnits(state, target, release.presetId);
    }
    close();
  };

  const cancelFromPointer = (event: PointerEvent, reason: TacticalOrderGestureCancelReason): void => {
    if (pointerId !== event.pointerId || !gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(reason);
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!gesture) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close('escape');
      return;
    }
    if (gesture.phase === 'open' && CAMERA_KEYS.has(event.key.toLowerCase())) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const presetId = tacticalOrderPresetFromKeyboard(event.key);
    if (gesture.phase !== 'open' || !presetId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    gesture = { ...gesture, highlightedPresetId: presetId };
    menu.selectByKeyboard(presetId);
  };

  const handleWheel = (event: WheelEvent): void => {
    if (!gesture || gesture.phase !== 'open') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  canvas.addEventListener('contextmenu', handleContextMenu, true);
  canvas.addEventListener('pointerdown', handlePointerDown, true);
  canvas.addEventListener('pointermove', handlePointerMove, true);
  canvas.addEventListener('pointerup', handlePointerUp, true);
  canvas.addEventListener('pointercancel', (event) => cancelFromPointer(event, 'pointer_cancel'), true);
  canvas.addEventListener('lostpointercapture', (event) => cancelFromPointer(event, 'pointer_capture_lost'), true);
  canvas.addEventListener('pointerleave', (event) => cancelFromPointer(event, 'pointer_leave'), true);
  canvas.addEventListener('wheel', handleWheel, { capture: true, passive: false });
  window.addEventListener('keydown', handleKeyDown, true);

  return () => {
    close('destroy');
    canvas.removeEventListener('contextmenu', handleContextMenu, true);
    canvas.removeEventListener('pointerdown', handlePointerDown, true);
    canvas.removeEventListener('pointermove', handlePointerMove, true);
    canvas.removeEventListener('pointerup', handlePointerUp, true);
    canvas.removeEventListener('wheel', handleWheel, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    menu.destroy();
  };
}
