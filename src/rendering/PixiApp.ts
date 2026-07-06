import { Application, Container } from 'pixi.js';
import { gridToCellLabel } from '../core/map/MapModel';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { tickSimulation } from '../core/simulation/SimulationTick';
import { BoardInputController } from '../input/BoardInputController';
import { CameraController } from '../input/CameraController';
import { PixiMapRenderer } from './PixiMapRenderer';
import { PixiOrderRenderer } from './PixiOrderRenderer';
import { PixiOverlayRenderer } from './PixiOverlayRenderer';
import { PixiUnitRenderer } from './PixiUnitRenderer';

export class PixiTacticalBoardApp {
  private readonly app: Application;
  private readonly worldContainer = new Container();
  private readonly mapRenderer = new PixiMapRenderer();
  private readonly orderRenderer = new PixiOrderRenderer();
  private readonly overlayRenderer = new PixiOverlayRenderer();
  private readonly unitRenderer = new PixiUnitRenderer();
  private readonly camera: CameraController;
  private readonly boardInput: BoardInputController;

  constructor(
    private readonly root: HTMLElement,
    private readonly debugPanel: HTMLElement,
    private readonly state: SimulationState,
  ) {
    this.app = new Application({
      backgroundColor: 0x121612,
      antialias: true,
      resizeTo: this.root,
    });

    const canvas = this.app.view as HTMLCanvasElement;
    canvas.setAttribute('aria-label', 'Tactical board prototype canvas');
    canvas.tabIndex = 0;
    this.root.appendChild(canvas);

    this.worldContainer.position.set(72, 72);
    this.app.stage.addChild(this.worldContainer);
    this.worldContainer.addChild(
      this.mapRenderer.container,
      this.orderRenderer.container,
      this.overlayRenderer.container,
      this.unitRenderer.container,
    );

    this.camera = new CameraController(canvas, this.worldContainer);
    this.boardInput = new BoardInputController(canvas, this.camera, this.state);
  }

  start(): void {
    this.mapRenderer.render(this.state.map);
    this.camera.attach();
    this.boardInput.attach();

    this.app.ticker.add(() => {
      tickSimulation(this.state, this.app.ticker.elapsedMS / 1000);
      this.renderFrame();
    });
  }

  destroy(): void {
    this.camera.destroy();
    this.boardInput.destroy();
    this.app.destroy(true);
  }

  private renderFrame(): void {
    this.orderRenderer.render(this.state.map, this.state.units, this.state.selectedUnitId);
    this.overlayRenderer.render(this.state);
    this.unitRenderer.render(this.state.map, this.state.units, this.state.selectedUnitId);
    this.updateDebugPanel();
  }

  private updateDebugPanel(): void {
    const selectedUnit = getSelectedUnit(this.state);
    const mouseLabel = this.state.mouseGridPosition
      ? gridToCellLabel(this.state.map, this.state.mouseGridPosition)
      : 'outside map';
    const orderTarget = selectedUnit?.order
      ? gridToCellLabel(this.state.map, selectedUnit.order.target)
      : 'none';

    this.debugPanel.textContent = [
      `Mouse cell: ${mouseLabel}`,
      `Selected: ${selectedUnit ? `${selectedUnit.label} (${selectedUnit.id})` : 'none'}`,
      `Move target: ${orderTarget}`,
      `Zoom: ${this.camera.zoom.toFixed(2)}x`,
      '',
      'Scope: no combat, no AI, no pathfinding.',
      'Core state is separate from Pixi rendering.',
    ].join('\n');
  }
}
