import { distance, type GridPosition } from '../core/geometry';
import { clampGridPositionToMap, worldToGrid } from '../core/map/MapModel';
import {
  issueRoutedMoveOrderToSelectedUnits,
  issueTacticalOrderToSelectedUnits,
} from '../core/orders/RoutedMoveOrders';
import { facingRadiansFromPoints } from '../core/orders/UnitFacingCommands';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getAiLabRuntime } from '../core/testing/AiLabRuntime';
import { getUnitCommandToolState, setRouteFacingDraft } from '../core/ui/RuntimeUiState';
import type { PixiTacticalBoardApp } from '../rendering/PixiApp';
import { installTacticalOrderVisualQaHarness } from '../testing/TacticalOrderVisualQaHarness';
import { TacticalOrderStatusCard } from '../ui/TacticalOrderStatusCard';
import {
  beginTacticalOrderGesture,
  cancelTacticalOrderGesture,
  openTacticalOrderGesture,
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
const STATUS_CARD_UPDATE_INTERVAL_MS = 250;

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
  const statusCard = new TacticalOrderStatusCard(state);
  const statusInterval = window.setInterval(() => statusCard.update(), STATUS_CARD_UPDATE_INTERVAL_MS);
  let pointerId: number | null = null;
  let gesture: TacticalOrderGestureState | null = null;
  let currentScreen: ScreenPoint | null = null;
  let currentGrid: GridPosition | null = null;
  let holdTimer: number | null = null;
  let keyboardConfirmed = false;
  let destroyed = false;

  const notifyChanged = (): void => {
    if (destroyed) return;
    statusCard.update(true);
    onChanged();
  };
  const destroyVisualQaHarness = installTacticalOrderVisualQaHarness(state, notifyChanged);

  const eventGrid = (event: { clientX: number; clientY: number }): GridPosition => {
    return clampGridPositionToMap(state.map, worldToGrid(state.map, camera.screenToWorld(event)));
  };

  const clearTimer = (): void => {
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    holdTimer = null;
  };

  const close = (reason?: TacticalOrderGestureCancelReason): void => {
    clearTimer();
    const closingGesture = gesture;
    const capturedPointerId = pointerId;
    if (closingGesture && reason) cancelTacticalOrderGesture(closingGesture, reason);
    pointerId = null;
    gesture = null;
    currentScreen = null;
    currentGrid = null;
    keyboardConfirmed = false;
    menu.hide();
    setRouteFacingDraft(state, null);
    if (capturedPointerId !== null && canvas.hasPointerCapture(capturedPointerId)) {
      canvas.releasePointerCapture(capturedPointerId);
    }
    notifyChanged();
  };

  const openMenu = (): void => {
    if (!gesture || pointerId === null || gesture.phase !== 'pending') return;
    const now = performance.now();
    const point = currentScreen ?? gesture.anchorScreen;
    const menuCenter = menu.show(gesture.anchorScreen, gesture.targetGrid);
    gesture = openTacticalOrderGesture(
      gesture,
      menuCenter,
      point,
      Math.max(now, gesture.startedAtMs + TACTICAL_ORDER_HOLD_DELAY_MS),
    );
    if (gesture.phase !== 'open') {
      menu.hide();
      return;
    }
    menu.updateHighlighted(gesture.highlightedPresetId);
    setRouteFacingDraft(state, null);
    notifyChanged();
  };

  const handleContextMenu = (event: MouseEvent): void => {
    if (!gesture || destroyed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (destroyed || event.button !== 2) return;
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
    if (destroyed || pointerId !== event.pointerId || !gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    currentScreen = { x: event.clientX, y: event.clientY };
    currentGrid = eventGrid(event);
    if (keyboardConfirmed) return;

    if (gesture.phase === 'pending' && performance.now() - gesture.startedAtMs >= TACTICAL_ORDER_HOLD_DELAY_MS) {
      openMenu();
    }
    if (!gesture) return;

    gesture = updateTacticalOrderGesture(gesture, currentScreen, performance.now());
    if (gesture.phase === 'open') {
      clearTimer();
      menu.updateHighlighted(gesture.highlightedPresetId);
      setRouteFacingDraft(state, null);
      return;
    }

    const finalFacingRadians = distance(gesture.targetGrid, currentGrid) >= QUICK_MOVE_FACING_THRESHOLD_CELLS
      ? facingRadiansFromPoints(gesture.targetGrid, currentGrid)
      : null;
    setRouteFacingDraft(state, {
      target: gesture.targetGrid,
      pointer: currentGrid,
      finalFacingRadians,
    });
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (destroyed || pointerId !== event.pointerId || !gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (keyboardConfirmed) {
      close();
      return;
    }

    if (gesture.phase === 'pending' && performance.now() - gesture.startedAtMs >= TACTICAL_ORDER_HOLD_DELAY_MS) {
      openMenu();
    }
    if (!gesture) return;

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
    if (destroyed || pointerId !== event.pointerId || !gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(reason);
  };

  const handlePointerCancel = (event: PointerEvent): void => cancelFromPointer(event, 'pointer_cancel');
  const handleLostPointerCapture = (event: PointerEvent): void => cancelFromPointer(event, 'pointer_capture_lost');
  const handlePointerLeave = (event: PointerEvent): void => cancelFromPointer(event, 'pointer_leave');

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (destroyed || !gesture) return;
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
    menu.updateHighlighted(presetId);
    issueTacticalOrderToSelectedUnits(state, gesture.targetGrid, presetId);
    keyboardConfirmed = true;
    menu.hide();
    setRouteFacingDraft(state, null);
    notifyChanged();
  };

  const handleWheel = (event: WheelEvent): void => {
    if (destroyed || !gesture || gesture.phase !== 'open') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  canvas.addEventListener('contextmenu', handleContextMenu, true);
  canvas.addEventListener('pointerdown', handlePointerDown, true);
  canvas.addEventListener('pointermove', handlePointerMove, true);
  canvas.addEventListener('pointerup', handlePointerUp, true);
  canvas.addEventListener('pointercancel', handlePointerCancel, true);
  canvas.addEventListener('lostpointercapture', handleLostPointerCapture, true);
  canvas.addEventListener('pointerleave', handlePointerLeave, true);
  canvas.addEventListener('wheel', handleWheel, { capture: true, passive: false });
  window.addEventListener('keydown', handleKeyDown, true);

  return () => {
    if (destroyed) return;
    destroyed = true;
    window.clearInterval(statusInterval);
    destroyVisualQaHarness();
    close('destroy');
    canvas.removeEventListener('contextmenu', handleContextMenu, true);
    canvas.removeEventListener('pointerdown', handlePointerDown, true);
    canvas.removeEventListener('pointermove', handlePointerMove, true);
    canvas.removeEventListener('pointerup', handlePointerUp, true);
    canvas.removeEventListener('pointercancel', handlePointerCancel, true);
    canvas.removeEventListener('lostpointercapture', handleLostPointerCapture, true);
    canvas.removeEventListener('pointerleave', handlePointerLeave, true);
    canvas.removeEventListener('wheel', handleWheel, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    statusCard.destroy();
    menu.destroy();
  };
}
