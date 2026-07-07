import { Application, Container } from 'pixi.js';
import { gridToCellLabel } from '../core/map/MapModel';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { tickSimulation } from '../core/simulation/SimulationTick';
import { BoardInputController } from '../input/BoardInputController';
import { CameraController } from '../input/CameraController';
import { formatDegrees, nextLocale, UI_COPY, type Locale } from '../i18n';
import { HtmlOverlayRenderer } from './HtmlOverlayRenderer';
import { PixiMapRenderer } from './PixiMapRenderer';
import { PixiOrderRenderer } from './PixiOrderRenderer';
import { PixiOverlayRenderer } from './PixiOverlayRenderer';
import { PixiUnitRenderer } from './PixiUnitRenderer';
import { PixiViewConeRenderer } from './PixiViewConeRenderer';

export class PixiTacticalBoardApp {
  private readonly app: Application;
  private readonly worldContainer = new Container();
  private readonly mapRenderer = new PixiMapRenderer();
  private readonly viewConeRenderer = new PixiViewConeRenderer();
  private readonly orderRenderer = new PixiOrderRenderer();
  private readonly overlayRenderer = new PixiOverlayRenderer();
  private readonly unitRenderer = new PixiUnitRenderer();
  private readonly camera: CameraController;
  private readonly boardInput: BoardInputController;
  private readonly htmlOverlayRenderer: HtmlOverlayRenderer;
  private locale: Locale = 'en';
  private showGrid = true;
  private showViewCones = true;

  constructor(
    private readonly root: HTMLElement,
    private readonly debugPanel: HTMLElement,
    private readonly languageToggle: HTMLButtonElement,
    private readonly gridToggle: HTMLButtonElement,
    private readonly visionToggle: HTMLButtonElement,
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
      this.viewConeRenderer.container,
      this.orderRenderer.container,
      this.overlayRenderer.container,
      this.unitRenderer.container,
    );

    this.camera = new CameraController(canvas, this.worldContainer);
    this.boardInput = new BoardInputController(canvas, this.camera, this.state);
    this.htmlOverlayRenderer = new HtmlOverlayRenderer(this.root, {
      worldToScreen: (world) => ({
        x: world.x * this.worldContainer.scale.x + this.worldContainer.x,
        y: world.y * this.worldContainer.scale.y + this.worldContainer.y,
      }),
    });
  }

  start(): void {
    this.mapRenderer.render(this.state.map, this.showGrid);
    this.updateStaticText();
    this.languageToggle.addEventListener('click', this.handleLanguageToggle);
    this.gridToggle.addEventListener('click', this.handleGridToggle);
    this.visionToggle.addEventListener('click', this.handleVisionToggle);
    this.camera.attach();
    this.boardInput.attach();

    this.app.ticker.add(() => {
      tickSimulation(this.state, this.app.ticker.elapsedMS / 1000);
      this.renderFrame();
    });
  }

  destroy(): void {
    this.languageToggle.removeEventListener('click', this.handleLanguageToggle);
    this.gridToggle.removeEventListener('click', this.handleGridToggle);
    this.visionToggle.removeEventListener('click', this.handleVisionToggle);
    this.camera.destroy();
    this.boardInput.destroy();
    this.htmlOverlayRenderer.destroy();
    this.app.destroy(true);
  }

  private renderFrame(): void {
    if (this.showViewCones) {
      this.viewConeRenderer.render(this.state.map, this.state.units, this.state.selectedUnitId);
    } else {
      this.viewConeRenderer.render(this.state.map, [], null);
    }

    this.orderRenderer.render(this.state.map, this.state.units, this.state.selectedUnitId);
    this.overlayRenderer.render(this.state);
    this.unitRenderer.render(this.state.map, this.state.units, this.state.selectedUnitId);
    this.htmlOverlayRenderer.render(this.state, this.locale);
    this.updateDebugPanel();
  }

  private readonly handleLanguageToggle = (): void => {
    this.locale = nextLocale(this.locale);
    this.updateStaticText();
    this.renderFrame();
  };

  private readonly handleGridToggle = (): void => {
    this.showGrid = !this.showGrid;
    this.mapRenderer.render(this.state.map, this.showGrid);
    this.updateDisplayToggles();
    this.renderFrame();
  };

  private readonly handleVisionToggle = (): void => {
    this.showViewCones = !this.showViewCones;
    this.updateDisplayToggles();
    this.renderFrame();
  };

  private updateStaticText(): void {
    const copy = UI_COPY[this.locale];
    document.documentElement.lang = this.locale;

    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n as keyof typeof copy.static | undefined;

      if (key && copy.static[key]) {
        element.textContent = copy.static[key];
      }
    });

    this.languageToggle.textContent = copy.debug.languageToggle;
    this.languageToggle.setAttribute('aria-label', copy.debug.languageToggleAria);
    this.updateDisplayToggles();
  }

  private updateDisplayToggles(): void {
    const labels = this.getDisplayToggleLabels();

    this.gridToggle.textContent = this.showGrid ? labels.gridOn : labels.gridOff;
    this.gridToggle.setAttribute('aria-pressed', String(this.showGrid));
    this.gridToggle.classList.toggle('hud-toggle-off', !this.showGrid);

    this.visionToggle.textContent = this.showViewCones ? labels.viewOn : labels.viewOff;
    this.visionToggle.setAttribute('aria-pressed', String(this.showViewCones));
    this.visionToggle.classList.toggle('hud-toggle-off', !this.showViewCones);
  }

  private getDisplayToggleLabels(): { gridOn: string; gridOff: string; viewOn: string; viewOff: string } {
    if (this.locale === 'ru') {
      return {
        gridOn: 'Сетка: вкл',
        gridOff: 'Сетка: выкл',
        viewOn: 'Обзор: вкл',
        viewOff: 'Обзор: выкл',
      };
    }

    return {
      gridOn: 'Grid: on',
      gridOff: 'Grid: off',
      viewOn: 'View cones: on',
      viewOff: 'View cones: off',
    };
  }

  private updateDebugPanel(): void {
    const selectedUnit = getSelectedUnit(this.state);
    const mouseLabel = this.state.mouseGridPosition
      ? gridToCellLabel(this.state.map, this.state.mouseGridPosition)
      : UI_COPY[this.locale].debug.outsideMap;
    const orderTarget = selectedUnit?.order
      ? gridToCellLabel(this.state.map, selectedUnit.order.target)
      : UI_COPY[this.locale].debug.none;
    const selectedLabel = selectedUnit
      ? `${selectedUnit.labels[this.locale]} (${selectedUnit.id})`
      : UI_COPY[this.locale].debug.none;
    const copy = UI_COPY[this.locale].debug;

    this.debugPanel.textContent = [
      `${copy.mouseCell}: ${mouseLabel}`,
      `${copy.selected}: ${selectedLabel}`,
      `${copy.moveTarget}: ${orderTarget}`,
      `${copy.facing}: ${selectedUnit ? formatDegrees(selectedUnit.facingRadians) : copy.none}`,
      `${copy.zoom}: ${this.camera.zoom.toFixed(2)}x`,
      `${copy.map}: ${this.state.map.width}×${this.state.map.height}`,
      '',
      copy.noCombatScope,
      copy.htmlLabels,
    ].join('\n');
  }
}
