import { worldToGrid } from '../core/map/MapModel';
import { issueMoveOrderToSelectedUnit, selectUnit, setMouseGridPosition, type SimulationState } from '../core/simulation/SimulationState';
import { findUnitAtGridPosition } from '../core/units/UnitModel';
import type { CameraController } from './CameraController';

export class BoardInputController {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: CameraController,
    private readonly state: SimulationState,
  ) {}

  attach(): void {
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
  }

  destroy(): void {
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
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
      const unit = findUnitAtGridPosition(this.state.units, grid);
      selectUnit(this.state, unit?.id ?? null);
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      issueMoveOrderToSelectedUnit(this.state, grid);
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const world = this.camera.screenToWorld(event);
    setMouseGridPosition(this.state, worldToGrid(this.state.map, world));
  };

  private readonly handlePointerLeave = (): void => {
    setMouseGridPosition(this.state, null);
  };
}
