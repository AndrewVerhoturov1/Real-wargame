import { distance, type GridPosition } from '../core/geometry';
import { placeConfiguredEditorEntity } from '../core/editor/GameEditorPlacement';
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
import {
  getAiTestLabSelectionTarget,
  selectAiTestLabTargetAtPosition,
} from '../core/testing/AiTestLabSelection';
import { setVisibilityProbe } from '../core/ui/RuntimeUiState';
import { findUnitAtGridPosition } from '../core/units/UnitModel';
import type { CameraController } from './CameraController';

const DRAG_SELECT_THRESHOLD_CELLS = 0.18;

export class BoardInputController {
  private leftPointerId: number | null = null;
  private leftStartGrid: GridPosition | null = null;
  private isDragSelecting = false;
  private lastPointerGrid: GridPosition | null = null;
  private altProbeActive = false;

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
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Alt') return;
    this.altProbeActive = true;
    if (!this.state.editor.enabled) setVisibilityProbe(this.state, true, this.lastPointerGrid);
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

      if (this.state.editor.enabled) {
        event.preventDefault();
        if (isTerrainPaintTool(String(this.state.editor.tool))) {
          paintEditorTerrainAt(this.state, grid);
        } else if (!placeConfiguredEditorEntity(this.state, grid)) {
          beginEditorPointerAction(this.state, grid);
        }
      }
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      if (!this.state.editor.enabled) issueMoveOrderToSelectedUnit(this.state, grid);
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const world = this.camera.screenToWorld(event);
    const grid = worldToGrid(this.state.map, world);
    this.lastPointerGrid = grid;
    setMouseGridPosition(this.state, grid);
    this.updateAltProbe(event, grid);

    if (this.leftPointerId !== event.pointerId || !this.leftStartGrid) return;

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
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.leftPointerId !== event.pointerId || !this.leftStartGrid) return;

    const world = this.camera.screenToWorld(event);
    const grid = worldToGrid(this.state.map, world);
    this.lastPointerGrid = grid;
    this.updateAltProbe(event, grid);

    if (this.state.editor.enabled) {
      if (!isTerrainPaintTool(String(this.state.editor.tool)) && !isSpawnTool(String(this.state.editor.tool))) {
        finishEditorPointerAction(this.state, grid);
      }
      this.clearLeftPointer(event.pointerId);
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
    if (this.leftPointerId === event.pointerId) {
      clearSelectionBox(this.state);
      cancelEditorPointerAction(this.state);
      this.clearLeftPointer(event.pointerId);
    }
  };

  private readonly handlePointerLeave = (): void => {
    this.lastPointerGrid = null;
    setMouseGridPosition(this.state, null);
    setVisibilityProbe(this.state, false, null);
  };

  private updateAltProbe(event: PointerEvent, grid: GridPosition): void {
    const active = !this.state.editor.enabled && (event.altKey || this.altProbeActive);
    setVisibilityProbe(this.state, active, active ? grid : null);
  }

  private clearLeftPointer(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    this.leftPointerId = null;
    this.leftStartGrid = null;
    this.isDragSelecting = false;
  }
}

function isSpawnTool(tool: string): boolean {
  return tool === 'spawn_object' || tool === 'spawn_unit' || tool === 'spawn_zone';
}
