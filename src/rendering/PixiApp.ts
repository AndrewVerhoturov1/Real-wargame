import { Application, Container } from 'pixi.js';
import { gridToCellLabel } from '../core/map/MapModel';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { tickSimulation } from '../core/simulation/SimulationTick';
import type { UnitModel } from '../core/units/UnitModel';
import { BoardInputController } from '../input/BoardInputController';
import { CameraController } from '../input/CameraController';
import { formatDegrees, nextLocale, UI_COPY, type Locale } from '../i18n';
import { HtmlOverlayRenderer } from './HtmlOverlayRenderer';
import { PixiMapRenderer } from './PixiMapRenderer';
import { PixiOrderRenderer } from './PixiOrderRenderer';
import { PixiOverlayRenderer } from './PixiOverlayRenderer';
import { PixiUnitRenderer } from './PixiUnitRenderer';
import { PixiViewConeRenderer } from './PixiViewConeRenderer';

const DEBUG_PANEL_UPDATE_INTERVAL_MS = 120;

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
  private lastMapRenderKey = '';
  private lastDebugPanelUpdateMs = 0;

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
    this.renderEditableMapLayerIfNeeded(true);
    this.updateStaticText();
    this.updateDebugPanelIfNeeded(true);
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
    this.renderEditableMapLayerIfNeeded(false);

    const visibleUnits = this.state.editor.layers.units ? this.state.units : [];
    const visibleSelectedIds = this.state.editor.layers.units ? this.state.selectedUnitIds : [];

    if (this.showViewCones) {
      this.viewConeRenderer.render(this.state.map, visibleUnits, visibleSelectedIds);
    } else {
      this.viewConeRenderer.render(this.state.map, [], []);
    }

    this.orderRenderer.render(this.state.map, visibleUnits, visibleSelectedIds);
    this.overlayRenderer.render(this.state, this.showGrid, this.state.editor.layers.pressureZones);
    this.unitRenderer.render(this.state.map, visibleUnits, visibleSelectedIds);
    this.htmlOverlayRenderer.render(this.state, this.locale);
    this.updateDebugPanelIfNeeded(false);
  }

  private renderEditableMapLayerIfNeeded(force: boolean): void {
    const nextKey = this.getMapRenderKey();

    if (!force && nextKey === this.lastMapRenderKey) {
      return;
    }

    this.lastMapRenderKey = nextKey;
    this.mapRenderer.render(
      this.state.map,
      this.showGrid,
      this.state.editor.selectedObjectId,
      this.state.editor.layers.objects,
    );
  }

  private getMapRenderKey(): string {
    const objectKey = this.state.editor.layers.objects
      ? this.state.map.objects
          .map((object) => [
            object.id,
            object.kind,
            roundForRenderKey(object.x),
            roundForRenderKey(object.y),
            roundForRenderKey(object.widthCells),
            roundForRenderKey(object.heightCells),
            roundForRenderKey(object.rotationRadians),
          ].join(':'))
          .join('|')
      : 'objects-hidden';

    return [
      `grid:${this.showGrid ? '1' : '0'}`,
      `objects:${this.state.editor.layers.objects ? '1' : '0'}`,
      `selected:${this.state.editor.selectedObjectId ?? 'none'}`,
      objectKey,
    ].join(';');
  }

  private readonly handleLanguageToggle = (): void => {
    this.locale = nextLocale(this.locale);
    this.updateStaticText();
    this.updateDebugPanelIfNeeded(true);
    this.renderFrame();
  };

  private readonly handleGridToggle = (): void => {
    this.showGrid = !this.showGrid;
    this.renderEditableMapLayerIfNeeded(true);
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

  private updateDebugPanelIfNeeded(force: boolean): void {
    const now = performance.now();

    if (!force && now - this.lastDebugPanelUpdateMs < DEBUG_PANEL_UPDATE_INTERVAL_MS) {
      return;
    }

    this.lastDebugPanelUpdateMs = now;
    this.updateDebugPanel();
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
      ? `${selectedUnit.labels[this.locale]} (${selectedUnit.id})${this.state.selectedUnitIds.length > 1 ? ` +${this.state.selectedUnitIds.length - 1}` : ''}`
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
      ...formatBehaviorInspector(selectedUnit, this.locale),
      '',
      copy.noCombatScope,
      copy.htmlLabels,
    ].join('\n');
  }
}

function formatBehaviorInspector(unit: UnitModel | undefined, locale: Locale): string[] {
  if (!unit) {
    return locale === 'ru'
      ? ['Инспектор поведения: выберите юнита.']
      : ['Behavior inspector: select a unit.'];
  }

  const runtime = unit.behaviorRuntime;
  const settings = unit.behaviorSettings;
  const labels = locale === 'ru'
    ? {
        title: 'Инспектор поведения',
        profile: 'Профиль',
        state: 'Состояние',
        posture: 'Положение',
        action: 'Действие',
        danger: 'Danger',
        stress: 'Stress',
        reason: 'Причина',
        stateReason: 'Почему состояние',
        postureReason: 'Почему положение',
        lastEvent: 'Последнее событие',
        thresholds: 'Пороги',
        none: 'нет',
      }
    : {
        title: 'Behavior inspector',
        profile: 'Profile',
        state: 'State',
        posture: 'Posture',
        action: 'Action',
        danger: 'Danger',
        stress: 'Stress',
        reason: 'Reason',
        stateReason: 'State reason',
        postureReason: 'Posture reason',
        lastEvent: 'Last event',
        thresholds: 'Thresholds',
        none: 'none',
      };

  return [
    `${labels.title}:`,
    `${labels.profile}: ${unit.behaviorProfile}`,
    `${labels.state}: ${runtime.state} (prev: ${runtime.previousState})`,
    `${labels.posture}: ${runtime.posture} (prev: ${runtime.previousPosture})`,
    `${labels.action}: ${runtime.currentAction}`,
    `${labels.danger}: ${runtime.danger} / raw ${runtime.rawDanger}`,
    `${labels.stress}: ${Math.round(runtime.stress)} / stop ${settings.stressStopThreshold}`,
    `${labels.reason}: ${runtime.reason}`,
    `${labels.stateReason}: ${runtime.stateChangedBecause}`,
    `${labels.postureReason}: ${runtime.postureChangedBecause}`,
    `${labels.lastEvent}: ${runtime.lastEvent ?? labels.none}`,
    `${labels.thresholds}: crouch ${settings.dangerCrouchThreshold}, prone ${settings.dangerProneThreshold}`,
  ];
}

function roundForRenderKey(value: number): string {
  return value.toFixed(3);
}
