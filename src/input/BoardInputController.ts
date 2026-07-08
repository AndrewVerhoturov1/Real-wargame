import { distance, type GridPosition } from '../core/geometry';
import { paintEditorTerrainAt, isTerrainPaintTool } from '../core/map/MapPaint';
import { worldToGrid } from '../core/map/MapModel';
import {
  beginEditorPointerAction,
  cancelEditorPointerAction,
  clearSelectionBox,
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
import { findUnitAtGridPosition } from '../core/units/UnitModel';
import type { CameraController } from './CameraController';

const DRAG_SELECT_THRESHOLD_CELLS = 0.18;

export class BoardInputController {
  private leftPointerId: number | null = null;
  private leftStartGrid: GridPosition | null = null;
  private isDragSelecting = false;

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
  }

  destroy(): void {
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.camera.isPanGesture(event)) {
      return;
    }

    const world = this.camera.screenToWorld(event);
    const grid = worldToGrid(this.state.map, world);

    if (event.button === 0) {
      this.leftPointerId = event.pointerId;
      this.leftStartGrid = grid;
      this.isDragSelecting = false;
      this.canvas.setPointerCapture(event.pointerId);

      if (this.state.editor.enabled) {
        event.preventDefault();
        if (isTerrainPaintTool(String(this.state.editor.tool))) {
          paintEditorTerrainAt(this.state, grid);
        } else {
          beginEditorPointerAction(this.state, grid);
        }
      }

      return;
    }

    if (event.button === 2) {
      event.preventDefault();

      if (!this.state.editor.enabled) {
        issueMoveOrderToSelectedUnit(this.state, grid);
      }
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const world = this.camera.screenToWorld(event);
    const grid = worldToGrid(this.state.map, world);
    setMouseGridPosition(this.state, grid);

    if (this.leftPointerId !== event.pointerId || !this.leftStartGrid) {
      return;
    }

    if (this.state.editor.enabled) {
      if (isTerrainPaintTool(String(this.state.editor.tool))) {
        paintEditorTerrainAt(this.state, grid);
      } else {
        updateEditorPointerAction(this.state, grid);
      }
      return;
    }

    if (!this.isDragSelecting && distance(this.leftStartGrid, grid) >= DRAG_SELECT_THRESHOLD_CELLS) {
      this.isDragSelecting = true;
      startSelectionBox(this.state, this.leftStartGrid);
    }

    if (this.isDragSelecting) {
      updateSelectionBox(this.state, grid);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.leftPointerId !== event.pointerId || !this.leftStartGrid) {
      return;
    }

    const world = this.camera.screenToWorld(event);
    const grid = worldToGrid(this.state.map, world);

    if (this.state.editor.enabled) {
      if (!isTerrainPaintTool(String(this.state.editor.tool))) {
        finishEditorPointerAction(this.state, grid);
      }
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
    if (this.leftPointerId === event.pointerId) {
      clearSelectionBox(this.state);
      cancelEditorPointerAction(this.state);
      this.clearLeftPointer(event.pointerId);
    }
  };

  private readonly handlePointerLeave = (): void => {
    setMouseGridPosition(this.state, null);
  };

  private clearLeftPointer(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId);
    }

    this.leftPointerId = null;
    this.leftStartGrid = null;
    this.isDragSelecting = false;
  }
}
