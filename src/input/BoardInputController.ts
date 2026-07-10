import { distance, type GridPosition } from '../core/geometry';
import { placeConfiguredEditorEntity } from '../core/editor/GameEditorPlacement';
import { paintEditorTerrainAt, isTerrainPaintTool } from '../core/map/MapPaint';
import { worldToGrid } from '../core/map/MapModel';
import {
  beginEditorPointerAction,
  cancelEditorPointerAction,
  clearSelectionBox,
  deleteSelectedEditorTargets,
  finishEditorPointerAction,
  issueMoveOrderToSelectedUnit,
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
  hoverSimulationCoverAtPosition,
  selectSimulationCoverAtPosition,
} from '../core/knowledge/SimulationCoverSelection';
import { getSimulationLayerState, setVisibilityProbe } from '../core/ui/RuntimeUiState';
import { findUnitAtGridPosition } from '../core/units/UnitModel';
import type { CameraController } from './CameraController';

const DRAG_SELECT_THRESHOLD_CELLS = 0.18;

interface PointerMoveSnapshot {
  clientX: number;
  clientY: number;
  pointerId: number;
  altKey: boolean;
}

export class BoardInputController {
  private leftPointerId: number | null = null;
  private leftStartGrid: GridPosition | null = null;
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
    this.cancelPendingPointerMove();
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

    const world = this.camera.screenToWorld(event);
    const grid = worldToGrid(this.state.map, world);
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
        if (isTerrainPaintTool(String(this.state.editor.tool))) {
          paintEditorTerrainAt(this.state, grid);
        } else if (!placeConfiguredEditorEntity(this.state, grid)) {
          beginEditorPointerAction(this.state, grid);
        }
        this.updateCursor();
      }
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      if (!this.state.editor.enabled && !getAiLabRuntime(this.state).open) {
        issueMoveOrderToSelectedUnit(this.state, grid);
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

    if (this.pointerMoveFrameId === null) {
      this.pointerMoveFrameId = window.requestAnimationFrame(this.flushPointerMove);
    }
  };

  private readonly flushPointerMove = (): void => {
    this.pointerMoveFrameId = null;
    const event = this.pendingPointerMove;
    this.pendingPointerMove = null;
    if (!event) return;
    this.processPointerMove(event);
  };

  private processPointerMove(event: PointerMoveSnapshot): void {
    const world = this.camera.screenToWorld(event);
    const grid = worldToGrid(this.state.map, world);
    this.lastPointerGrid = grid;
    setMouseGridPosition(this.state, grid);
    this.updateAltProbe(event, grid);

    if (!this.state.editor.enabled && getSimulationLayerState(this.state).mode !== 'info') {
      hoverSimulationCoverAtPosition(this.state, grid);
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
      if (isTerrainPaintTool(String(this.state.editor.tool))) {
        paintEditorTerrainAt(this.state, grid);
      } else if (!isSpawnTool(String(this.state.editor.tool))) {
        updateEditorPointerAction(this.state, grid);
      }
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
    if (this.leftPointerId !== event.pointerId || !this.leftStartGrid) return;

    const world = this.camera.screenToWorld(event);
    const grid = worldToGrid(this.state.map, world);
    this.lastPointerGrid = grid;
    this.updateAltProbe(event, grid);

    if (!this.state.editor.enabled && getAiLabRuntime(this.state).open) {
      finishAiLabPointerAction(this.state, grid);
      this.clearLeftPointer(event.pointerId);
      this.updateCursor();
      return;
    }

    if (this.state.editor.enabled) {
      if (getAiLabRuntime(this.state).drag?.kind === 'threat') {
        finishAiLabPointerAction(this.state, grid);
      } else if (!isTerrainPaintTool(String(this.state.editor.tool)) && !isSpawnTool(String(this.state.editor.tool))) {
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
      if (unit) {
        selectUnit(this.state, unit.id);
      } else if (getSimulationLayerState(this.state).mode !== 'info') {
        const cover = selectSimulationCoverAtPosition(this.state, grid);
        if (!cover) selectUnit(this.state, null);
      } else {
        selectUnit(this.state, null);
      }
    }

    this.clearLeftPointer(event.pointerId);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.cancelPendingPointerMove();
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
    hoverSimulationCoverAtPosition(this.state, null);
    setVisibilityProbe(this.state, false, null);
    this.updateCursor();
  };

  private updateAltProbe(event: { altKey: boolean }, grid: GridPosition): void {
    const active = !this.state.editor.enabled
      && !getAiLabRuntime(this.state).open
      && (event.altKey || this.altProbeActive);
    setVisibilityProbe(this.state, active, active ? grid : null);
  }

  private updateCursor(): void {
    const cursor = resolveAiLabCursor(this.state);
    this.canvas.style.cursor = cursor;
    document.body.classList.toggle('cursor-crosshair-threat', getAiLabRuntime(this.state).open && getAiLabRuntime(this.state).tool === 'place_threat');
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
}

function isSpawnTool(tool: string): boolean {
  return tool === 'spawn_object' || tool === 'spawn_unit' || tool === 'spawn_zone';
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}
