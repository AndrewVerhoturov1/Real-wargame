import { distance, type GridPosition } from '../core/geometry';
import { placeConfiguredEditorEntity } from '../core/editor/GameEditorPlacement';
import { isTerrainPaintTool, paintEditorTerrainAt } from '../core/map/MapPaint';
import { worldToGrid } from '../core/map/MapModel';
import { faceSelectedUnitsToward, facingRadiansFromPoints } from '../core/orders/UnitFacingCommands';
import { issueRoutedMoveOrderToSelectedUnits } from '../core/orders/RoutedMoveOrders';
import {
  beginEditorPointerAction,
  cancelEditorPointerAction,
  clearSelectionBox,
  deleteSelectedEditorTargets,
  finishEditorPointerAction,
  selectUnit,
  selectUnitsInBox,
  setMouseGridPosition,
  startSelectionBox,
  updateEditorPointerAction,
  updateSelectionBox,
  type SimulationState,
} from '../core/simulation/SimulationState';
import {
  beginAiLabPointerAction,
  cancelAiLabPointerAction,
  finishAiLabPointerAction,
  resolveAiLabCursor,
  updateAiLabPointerAction,
} from '../core/testing/AiLabInteraction';
import { duplicateSelectedLabEntity, getAiLabRuntime } from '../core/testing/AiLabRuntime';
import {
  getAiTestLabSelectionTarget,
  selectAiTestLabTargetAtPosition,
} from '../core/testing/AiTestLabSelection';
import {
  consumeTurnTool,
  cycleTacticalOverlayMode,
  getUnitCommandToolState,
  setRouteFacingDraft,
  setTurnToolActive,
  setVisibilityProbe,
} from '../core/ui/RuntimeUiState';
import { findUnitAtGridPosition } from '../core/units/UnitModel';
import type { CameraController } from './CameraController';

const DRAG_SELECT_THRESHOLD_CELLS = 0.18;
const RIGHT_DRAG_FACING_THRESHOLD_CELLS = 0.35;
const COMMAND_TOOL_CHANGED_EVENT = 'real-wargame:unit-command-tool-changed';
const TACTICAL_OVERLAY_MODE_CHANGED_EVENT = 'real-wargame:tactical-overlay-mode-changed';

interface PointerMoveSnapshot {
  clientX: number;
  clientY: number;
  pointerId: number;
  altKey: boolean;
}

export class BoardInputController {
  private leftPointerId: number | null = null;
  private leftStartGrid: GridPosition | null = null;
  private rightPointerId: number | null = null;
  private rightStartGrid: GridPosition | null = null;
  private rightCurrentGrid: GridPosition | null = null;
  private isDragSelecting = false;
  private lastPointerGrid: GridPosition | null = null;
  private altProbeActive = false;
  private pendingPointerMove: PointerMoveSnapshot | null = null;
  private pointerMoveFrameId: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: CameraController,
    private readonly state: SimulationState,
  ) {}

  attach(): void {
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener(COMMAND_TOOL_CHANGED_EVENT, this.handleCommandToolChanged);
  }

  destroy(): void {
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener(COMMAND_TOOL_CHANGED_EVENT, this.handleCommandToolChanged);
    this.cancelPendingPointerMove();
    this.clearRightPointer();
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Alt') {
      this.altProbeActive = true;
      if (!this.state.editor.enabled && !getAiLabRuntime(this.state).open) {
        setVisibilityProbe(this.state, true, this.lastPointerGrid);
      }
      return;
    }

    if (isTextInput(event.target)) return;

    if (!this.state.editor.enabled && !getAiLabRuntime(this.state).open && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      cycleTacticalOverlayMode(this.state);
      window.dispatchEvent(new CustomEvent(TACTICAL_OVERLAY_MODE_CHANGED_EVENT));
      return;
    }

    if (!this.state.editor.enabled && !getAiLabRuntime(this.state).open && event.key === 'Escape') {
      event.preventDefault();
      setTurnToolActive(this.state, false);
      setRouteFacingDraft(this.state, null);
      this.clearRightPointer();
      this.updateCursor();
      return;
    }

    if (this.state.editor.enabled) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditorPointerAction(this.state);
        cancelAiLabPointerAction(this.state);
        this.state.editor.tool = 'select';
        this.state.editor.lastMessage = 'Действие отменено. Инструмент: выбор.';
        this.updateCursor();
      } else if (event.key === 'Delete') {
        event.preventDefault();
        deleteSelectedEditorTargets(this.state);
      }
      return;
    }

    if (!getAiLabRuntime(this.state).open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelAiLabPointerAction(this.state);
      this.updateCursor();
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      deleteSelectedEditorTargets(this.state);
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateSelectedLabEntity(this.state);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== 'Alt') return;
    this.altProbeActive = false;
    setVisibilityProbe(this.state, false, null);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.camera.isPanGesture(event)) return;
    const grid = worldToGrid(this.state.map, this.camera.screenToWorld(event));
    this.lastPointerGrid = grid;
    this.updateAltProbe(event, grid);

    if (event.button === 0) {
      this.leftPointerId = event.pointerId;
      this.leftStartGrid = grid;
      this.isDragSelecting = false;
      this.canvas.setPointerCapture(event.pointerId);
      if (!this.state.editor.enabled && getAiLabRuntime(this.state).open) {
        event.preventDefault();
        beginAiLabPointerAction(this.state, grid);
        this.updateCursor();
        return;
      }
      if (this.state.editor.enabled) {
        event.preventDefault();
        if (beginAiLabPointerAction(this.state, grid)) {
          this.updateCursor();
          return;
        }
        if (isTerrainPaintTool(String(this.state.editor.tool))) paintEditorTerrainAt(this.state, grid);
        else if (!placeConfiguredEditorEntity(this.state, grid)) beginEditorPointerAction(this.state, grid);
        this.updateCursor();
      }
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      if (!this.state.editor.enabled && !getAiLabRuntime(this.state).open) {
        if (getUnitCommandToolState(this.state).turnToolActive) {
          faceSelectedUnitsToward(this.state, grid);
          consumeTurnTool(this.state);
          setRouteFacingDraft(this.state, null);
          window.dispatchEvent(new CustomEvent(COMMAND_TOOL_CHANGED_EVENT));
          this.updateCursor();
          return;
        }
        this.rightPointerId = event.pointerId;
        this.rightStartGrid = grid;
        this.rightCurrentGrid = grid;
        this.canvas.setPointerCapture(event.pointerId);
        setRouteFacingDraft(this.state, { target: grid, pointer: grid, finalFacingRadians: null });
      }
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pendingPointerMove = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      altKey: event.altKey,
    };
    if (this.pointerMoveFrameId === null) this.pointerMoveFrameId = window.requestAnimationFrame(this.flushPointerMove);
  };

  private readonly flushPointerMove = (): void => {
    this.pointerMoveFrameId = null;
    const event = this.pendingPointerMove;
    this.pendingPointerMove = null;
    if (event) this.processPointerMove(event);
  };

  private processPointerMove(event: PointerMoveSnapshot): void {
    const grid = worldToGrid(this.state.map, this.camera.screenToWorld(event));
    this.lastPointerGrid = grid;
    setMouseGridPosition(this.state, grid);
    this.updateAltProbe(event, grid);

    if (this.rightPointerId === event.pointerId && this.rightStartGrid) {
      this.rightCurrentGrid = grid;
      const finalFacingRadians = distance(this.rightStartGrid, grid) >= RIGHT_DRAG_FACING_THRESHOLD_CELLS
        ? facingRadiansFromPoints(this.rightStartGrid, grid)
        : null;
      setRouteFacingDraft(this.state, { target: this.rightStartGrid, pointer: grid, finalFacingRadians });
      return;
    }
    if (!this.state.editor.enabled && getAiLabRuntime(this.state).open) {
      updateAiLabPointerAction(this.state, grid);
      this.updateCursor();
      return;
    }
    if (this.state.editor.enabled && getAiLabRuntime(this.state).drag?.kind === 'threat') {
      updateAiLabPointerAction(this.state, grid);
      this.updateCursor();
      return;
    }
    if (this.leftPointerId !== event.pointerId || !this.leftStartGrid) {
      if (this.state.editor.enabled) {
        updateAiLabPointerAction(this.state, grid);
        this.updateCursor();
      }
      return;
    }
    if (this.state.editor.enabled) {
      if (isTerrainPaintTool(String(this.state.editor.tool))) paintEditorTerrainAt(this.state, grid);
      else if (!isSpawnTool(String(this.state.editor.tool))) updateEditorPointerAction(this.state, grid);
      return;
    }
    if (getAiTestLabSelectionTarget(this.state)) return;
    if (!this.isDragSelecting && distance(this.leftStartGrid, grid) >= DRAG_SELECT_THRESHOLD_CELLS) {
      this.isDragSelecting = true;
      startSelectionBox(this.state, this.leftStartGrid);
    }
    if (this.isDragSelecting) updateSelectionBox(this.state, grid);
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.cancelPendingPointerMove();
    if (event.button === 2 && this.rightPointerId === event.pointerId && this.rightStartGrid) {
      const grid = worldToGrid(this.state.map, this.camera.screenToWorld(event));
      const finalFacingRadians = distance(this.rightStartGrid, grid) >= RIGHT_DRAG_FACING_THRESHOLD_CELLS
        ? facingRadiansFromPoints(this.rightStartGrid, grid) ?? undefined
        : undefined;
      issueRoutedMoveOrderToSelectedUnits(this.state, this.rightStartGrid, finalFacingRadians);
      this.clearRightPointer();
      return;
    }
    if (this.leftPointerId !== event.pointerId || !this.leftStartGrid) return;
    const grid = worldToGrid(this.state.map, this.camera.screenToWorld(event));
    this.lastPointerGrid = grid;
    this.updateAltProbe(event, grid);

    if (!this.state.editor.enabled && getAiLabRuntime(this.state).open) {
      finishAiLabPointerAction(this.state, grid);
      this.clearLeftPointer(event.pointerId);
      this.updateCursor();
      return;
    }
    if (this.state.editor.enabled) {
      if (getAiLabRuntime(this.state).drag?.kind === 'threat') finishAiLabPointerAction(this.state, grid);
      else if (!isTerrainPaintTool(String(this.state.editor.tool)) && !isSpawnTool(String(this.state.editor.tool))) {
        finishEditorPointerAction(this.state, grid);
      }
      this.clearLeftPointer(event.pointerId);
      this.updateCursor();
      return;
    }
    const labSelectionTarget = getAiTestLabSelectionTarget(this.state);
    if (!this.isDragSelecting && labSelectionTarget) {
      selectAiTestLabTargetAtPosition(this.state, grid);
      this.clearLeftPointer(event.pointerId);
      return;
    }
    if (this.isDragSelecting && this.state.selectionBox) {
      updateSelectionBox(this.state, grid);
      selectUnitsInBox(this.state, this.state.selectionBox);
      clearSelectionBox(this.state);
    } else {
      const unit = findUnitAtGridPosition(this.state.units, grid);
      selectUnit(this.state, unit?.id ?? null);
    }
    this.clearLeftPointer(event.pointerId);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.cancelPendingPointerMove();
    if (this.rightPointerId === event.pointerId) this.clearRightPointer();
    if (this.leftPointerId === event.pointerId) {
      clearSelectionBox(this.state);
      cancelEditorPointerAction(this.state);
      cancelAiLabPointerAction(this.state);
      this.clearLeftPointer(event.pointerId);
      this.updateCursor();
    }
  };

  private readonly handlePointerLeave = (): void => {
    this.cancelPendingPointerMove();
    this.lastPointerGrid = null;
    setMouseGridPosition(this.state, null);
    setVisibilityProbe(this.state, false, null);
    this.clearRightPointer();
    this.updateCursor();
  };

  private updateAltProbe(event: { altKey: boolean }, grid: GridPosition): void {
    const active = !this.state.editor.enabled
      && !getAiLabRuntime(this.state).open
      && (event.altKey || this.altProbeActive);
    setVisibilityProbe(this.state, active, active ? grid : null);
  }

  private updateCursor(): void {
    if (getUnitCommandToolState(this.state).turnToolActive) this.canvas.style.cursor = 'crosshair';
    else this.canvas.style.cursor = resolveAiLabCursor(this.state);
    document.body.classList.toggle(
      'cursor-crosshair-threat',
      getAiLabRuntime(this.state).open && getAiLabRuntime(this.state).tool === 'place_threat',
    );
  }

  private clearLeftPointer(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    this.leftPointerId = null;
    this.leftStartGrid = null;
    this.isDragSelecting = false;
  }

  private cancelPendingPointerMove(): void {
    if (this.pointerMoveFrameId !== null) {
      window.cancelAnimationFrame(this.pointerMoveFrameId);
      this.pointerMoveFrameId = null;
    }
    this.pendingPointerMove = null;
  }

  private readonly handleCommandToolChanged = (): void => {
    this.updateCursor();
  };

  private clearRightPointer(): void {
    if (this.rightPointerId !== null && this.canvas.hasPointerCapture(this.rightPointerId)) {
      this.canvas.releasePointerCapture(this.rightPointerId);
    }
    this.rightPointerId = null;
    this.rightStartGrid = null;
    this.rightCurrentGrid = null;
    setRouteFacingDraft(this.state, null);
  }
}

function isSpawnTool(tool: string): boolean {
  return tool === 'spawn_object' || tool === 'spawn_unit' || tool === 'spawn_zone';
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}
