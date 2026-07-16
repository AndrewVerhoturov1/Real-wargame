import { Application, Container, type Ticker } from 'pixi.js';
import { PerformanceMonitor } from '../core/debug/PerformanceMonitor';
import { measurePerformancePhase } from '../core/debug/PerformancePhases';
import { getCell, gridToCellLabel, type MapCell } from '../core/map/MapModel';
import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { tickSimulation } from '../core/simulation/SimulationTick';
import type { UnitModel } from '../core/units/UnitModel';
import { BoardInputController } from '../input/BoardInputController';
import { CameraController } from '../input/CameraController';
import { formatDegrees, nextLocale, UI_COPY, type Locale } from '../i18n';
import { HtmlOverlayRenderer } from './HtmlOverlayRenderer';
import { PixiAwarenessHeatmapRenderer } from './PixiAwarenessHeatmapRenderer';
import { PixiCoverDirectionRenderer } from './PixiCoverDirectionRenderer';
import { PixiMapRenderer } from './PixiMapRenderer';
import { PixiRouteCostOverlayRenderer } from './PixiRouteCostOverlayRenderer';
import { PixiOrderRenderer } from './PixiOrderRenderer';
import { PixiOverlayRenderer } from './PixiOverlayRenderer';
import { PixiThreatEditorRenderer } from './PixiThreatEditorRenderer';
import { PixiUnitRenderer } from './PixiUnitRenderer';
import { PixiViewConeRenderer } from './PixiViewConeRenderer';

const DEBUG_PANEL_UPDATE_INTERVAL_MS = 300;
const TARGET_MAX_FPS = 60;

type PausableSimulationState = SimulationState & { paused?: boolean };

export class PixiTacticalBoardApp {
  private readonly app: Application;
  private readonly worldContainer = new Container();
  private readonly mapRenderer = new PixiMapRenderer();
  private readonly routeCostOverlayRenderer = new PixiRouteCostOverlayRenderer();
  private readonly awarenessHeatmapRenderer = new PixiAwarenessHeatmapRenderer();
  private readonly viewConeRenderer = new PixiViewConeRenderer();
  private readonly orderRenderer = new PixiOrderRenderer();
  private readonly overlayRenderer = new PixiOverlayRenderer();
  private readonly coverDirectionRenderer = new PixiCoverDirectionRenderer();
  private readonly threatEditorRenderer = new PixiThreatEditorRenderer();
  private readonly unitRenderer = new PixiUnitRenderer();
  private readonly camera: CameraController;
  private readonly boardInput: BoardInputController;
  private readonly htmlOverlayRenderer: HtmlOverlayRenderer;
  private readonly fixedScaleLabel = document.createElement('div');
  private readonly performanceMonitor = new PerformanceMonitor();
  private locale: Locale = 'en';
  private showGrid = true;
  private showViewCones = false;
  private showHeightLabels = false;
  private lastMapRenderKey = '';
  private mapRenderInvalidated = true;
  private lastDebugPanelUpdateMs = 0;
  private started = false;
  private destroyed = false;

  private constructor(
    private readonly root: HTMLElement,
    private readonly debugPanel: HTMLElement,
    private readonly languageToggle: HTMLButtonElement,
    private readonly gridToggle: HTMLButtonElement,
    private readonly visionToggle: HTMLButtonElement,
    private readonly heightToggle: HTMLButtonElement,
    private readonly state: SimulationState,
    app: Application,
  ) {
    this.app = app;
    this.app.ticker.maxFPS = TARGET_MAX_FPS;
    this.app.stage.eventMode = 'none';
    this.app.stage.interactiveChildren = false;
    this.worldContainer.eventMode = 'none';
    this.worldContainer.interactiveChildren = false;

    const canvas = this.app.canvas;
    canvas.setAttribute('aria-label', 'Tactical board prototype canvas');
    canvas.tabIndex = 0;
    this.root.appendChild(canvas);

    this.fixedScaleLabel.className = 'map-scale-fixed-label';
    this.fixedScaleLabel.textContent = `1 клетка = ${this.state.map.metersPerCell} м`;
    this.root.appendChild(this.fixedScaleLabel);

    this.worldContainer.position.set(72, 72);
    this.app.stage.addChild(this.worldContainer);
    this.worldContainer.addChild(
      this.mapRenderer.container,
      this.routeCostOverlayRenderer.container,
      this.awarenessHeatmapRenderer.container,
      this.viewConeRenderer.container,
      this.orderRenderer.container,
      this.overlayRenderer.container,
      this.coverDirectionRenderer.container,
      this.threatEditorRenderer.container,
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

  static async create(
    root: HTMLElement,
    debugPanel: HTMLElement,
    languageToggle: HTMLButtonElement,
    gridToggle: HTMLButtonElement,
    visionToggle: HTMLButtonElement,
    heightToggle: HTMLButtonElement,
    state: SimulationState,
  ): Promise<PixiTacticalBoardApp> {
    const app = new Application();
    try {
      await app.init({
        background: 0x121612,
        backgroundAlpha: 1,
        antialias: true,
        preference: 'webgl',
        resizeTo: root,
      });
      return new PixiTacticalBoardApp(
        root,
        debugPanel,
        languageToggle,
        gridToggle,
        visionToggle,
        heightToggle,
        state,
        app,
      );
    } catch (error) {
      try {
        app.destroy({ removeView: true, releaseGlobalResources: true });
      } catch {
        // init may reject before the renderer/plugins exist; preserve the original startup error.
      }
      throw error;
    }
  }

  start(): void {
    if (this.started || this.destroyed) return;
    this.renderEditableMapLayerIfNeeded(true);
    this.viewConeRenderer.clear();
    this.updateStaticText();
    this.updateDebugPanelIfNeeded(true);
    this.languageToggle.addEventListener('click', this.handleLanguageToggle);
    this.gridToggle.addEventListener('click', this.handleGridToggle);
    this.visionToggle.addEventListener('click', this.handleVisionToggle);
    this.heightToggle.addEventListener('click', this.handleHeightToggle);
    this.camera.attach();
    this.boardInput.attach();

    this.app.ticker.add(this.tick);
    this.started = true;
  }

  private readonly tick = (ticker: Ticker): void => {
    if (!this.getPaused()) {
      measurePerformancePhase('ticker.simulation', () => {
        tickSimulation(this.state, ticker.elapsedMS / 1000);
      });
    }
    measurePerformancePhase('ticker.render-frame', () => {
      this.renderFrame();
    });
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    this.app.stop();
    this.started = false;
    this.languageToggle.removeEventListener('click', this.handleLanguageToggle);
    this.gridToggle.removeEventListener('click', this.handleGridToggle);
    this.visionToggle.removeEventListener('click', this.handleVisionToggle);
    this.heightToggle.removeEventListener('click', this.handleHeightToggle);
    this.camera.destroy();
    this.boardInput.destroy();
    this.mapRenderer.container.cacheAsTexture(false);
    this.overlayRenderer.destroy();
    if (this.routeCostOverlayRenderer.container.parent === this.worldContainer) {
      this.worldContainer.removeChild(this.routeCostOverlayRenderer.container);
    }
    this.routeCostOverlayRenderer.destroy();
    if (this.awarenessHeatmapRenderer.container.parent === this.worldContainer) {
      this.worldContainer.removeChild(this.awarenessHeatmapRenderer.container);
    }
    this.awarenessHeatmapRenderer.destroy();
    this.htmlOverlayRenderer.destroy();
    this.fixedScaleLabel.remove();
    this.app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true, texture: true, textureSource: true },
    );
  }

  forceRender(): void {
    if (this.destroyed) return;
    this.mapRenderInvalidated = true;
    this.renderNow();
  }

  /** Render changing simulation/UI layers while retaining the immutable map cache. */
  renderNow(): void {
    if (this.destroyed) return;
    this.renderFrame();
    this.updateDebugPanelIfNeeded(true);
  }

  downloadPerformanceReport(): void {
    const report = this.performanceMonitor.buildReport(this.state, this.camera.zoom, {
      pixiMajorVersion: '8',
      antialias: true,
      backgroundAlpha: 1,
      maxFPS: TARGET_MAX_FPS,
      mapRender: 'revision-driven map rebuilds; editable batched Pixi Graphics terrain + raster relief/forest + grid/objects',
      zoomMode: 'requestAnimationFrame-coalesced wheel input anchored under the pointer',
      keyboardPan: 'continuous WASD and arrow-key camera movement synchronized to animation frames',
      pointerMode: 'pointer movement coalesced to one state update per animation frame',
      grid: this.showGrid,
      viewCones: this.showViewCones,
      heightLabels: this.showHeightLabels,
      htmlLabels: 'map labels are HTML overlay, height numbers are hidden until the debug toggle is enabled',
    });
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `real-wargame-performance-${buildTimestampForFileName()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.state.editor.lastMessage = 'Отчёт производительности скачан. Его можно прислать для разбора тормозов.';
  }

  private getPaused(): boolean {
    return Boolean((this.state as PausableSimulationState).paused);
  }

  private renderFrame(): void {
    const renderStartedAt = performance.now();
    measurePerformancePhase('render.map', () => this.renderEditableMapLayerIfNeeded(false));

    const visibleUnits = this.state.editor.layers.units ? this.state.units : [];
    const visibleSelectedIds = this.state.editor.layers.units ? this.state.selectedUnitIds : [];

    if (this.showViewCones) {
      measurePerformancePhase('render.view-cones', () => {
        this.viewConeRenderer.render(this.state.map, visibleUnits, visibleSelectedIds);
      });
    }

    measurePerformancePhase('render.awareness-heatmap', () => this.awarenessHeatmapRenderer.render(this.state));
    measurePerformancePhase('render.route-cost', () => this.routeCostOverlayRenderer.render(this.state));
    measurePerformancePhase('render.orders', () => this.orderRenderer.render(this.state.map, visibleUnits, visibleSelectedIds));
    measurePerformancePhase('render.overlay', () => {
      this.overlayRenderer.render(this.state, this.showGrid, this.state.editor.layers.pressureZones);
    });
    measurePerformancePhase('render.cover-direction', () => this.coverDirectionRenderer.render(this.state));
    measurePerformancePhase('render.threat-editor', () => this.threatEditorRenderer.render(this.state));
    measurePerformancePhase('render.units', () => this.unitRenderer.render(this.state.map, visibleUnits, visibleSelectedIds));
    measurePerformancePhase('render.html-overlay', () => {
      this.htmlOverlayRenderer.render(this.state, this.locale, this.showHeightLabels);
    });
    measurePerformancePhase('render.debug-panel', () => this.updateDebugPanelIfNeeded(false));
    this.performanceMonitor.recordFrame(this.state, this.camera.zoom, performance.now() - renderStartedAt, this.showGrid);
  }

  private renderEditableMapLayerIfNeeded(force: boolean): void {
    const nextKey = this.getMapRenderKey();

    if (!force && !this.mapRenderInvalidated && nextKey === this.lastMapRenderKey) {
      return;
    }

    this.lastMapRenderKey = nextKey;
    this.mapRenderInvalidated = false;
    this.mapRenderer.container.cacheAsTexture(false);
    this.mapRenderer.render(
      this.state.map,
      this.showGrid,
      this.state.editor.selectedObjectId,
      this.state.editor.layers.objects,
    );

    // The whole map, grid and map objects are static during simulation. One texture is much
    // cheaper to scale and translate than the original collection of vector Graphics objects.
    if (!this.state.editor.enabled) this.mapRenderer.container.cacheAsTexture(true);
  }

  private getMapRenderKey(): string {
    const revisions = getMapRevisionSnapshot(this.state.map);
    return [
      `editor:${this.state.editor.enabled ? '1' : '0'}`,
      `grid:${this.showGrid ? '1' : '0'}`,
      `objects:${this.state.editor.layers.objects ? '1' : '0'}`,
      `selected:${this.state.editor.selectedObjectId ?? 'none'}`,
      `cellSize:${this.state.map.cellSize}`,
      `terrainRevision:${revisions.terrain}`,
      `heightRevision:${revisions.height}`,
      `forestRevision:${revisions.forest}`,
      `objectsRevision:${revisions.objects}`,
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
    this.mapRenderInvalidated = true;
    this.renderEditableMapLayerIfNeeded(true);
    this.updateDisplayToggles();
    this.renderFrame();
  };

  private readonly handleVisionToggle = (): void => {
    this.showViewCones = !this.showViewCones;
    if (!this.showViewCones) {
      this.viewConeRenderer.clear();
    }
    this.updateDisplayToggles();
    this.renderFrame();
  };

  private readonly handleHeightToggle = (): void => {
    this.showHeightLabels = !this.showHeightLabels;
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

    this.fixedScaleLabel.textContent = `1 клетка = ${this.state.map.metersPerCell} м`;
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

    this.heightToggle.textContent = this.showHeightLabels ? labels.heightOn : labels.heightOff;
    this.heightToggle.setAttribute('aria-pressed', String(this.showHeightLabels));
    this.heightToggle.classList.toggle('hud-toggle-off', !this.showHeightLabels);
  }

  private getDisplayToggleLabels(): {
    gridOn: string;
    gridOff: string;
    viewOn: string;
    viewOff: string;
    heightOn: string;
    heightOff: string;
  } {
    if (this.locale === 'ru') {
      return {
        gridOn: 'Сетка: вкл',
        gridOff: 'Сетка: выкл',
        viewOn: 'Обзор: вкл',
        viewOff: 'Обзор: выкл',
        heightOn: 'Цифры высоты: вкл',
        heightOff: 'Цифры высоты: выкл',
      };
    }

    return {
      gridOn: 'Grid: on',
      gridOff: 'Grid: off',
      viewOn: 'View cones: on',
      viewOff: 'View cones: off',
      heightOn: 'Height numbers: on',
      heightOff: 'Height numbers: off',
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
    const hoveredCell = this.state.mouseGridPosition
      ? getCell(this.state.map, Math.floor(this.state.mouseGridPosition.x), Math.floor(this.state.mouseGridPosition.y))
      : undefined;
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
    const pauseLabel = this.locale === 'ru' ? 'Пауза' : 'Pause';
    const pauseState = this.getPaused()
      ? this.locale === 'ru' ? 'вкл — симуляция остановлена' : 'on — simulation stopped'
      : this.locale === 'ru' ? 'выкл — симуляция идёт' : 'off — simulation running';

    this.debugPanel.textContent = [
      `${copy.mouseCell}: ${mouseLabel}`,
      ...formatHoveredCellDetails(hoveredCell, this.locale),
      `${copy.selected}: ${selectedLabel}`,
      `${copy.moveTarget}: ${orderTarget}`,
      `${copy.facing}: ${selectedUnit ? formatDegrees(selectedUnit.facingRadians) : copy.none}`,
      `${copy.zoom}: ${this.camera.zoom.toFixed(1)}x`,
      `${copy.map}: ${this.state.map.width}×${this.state.map.height}`,
      `${pauseLabel}: ${pauseState}`,
      '',
      ...formatBehaviorInspector(selectedUnit, this.locale),
      '',
      copy.noCombatScope,
      copy.htmlLabels,
    ].join('\n');
  }
}

function formatHoveredCellDetails(cell: MapCell | undefined, locale: Locale): string[] {
  if (!cell) {
    return locale === 'ru'
      ? ['Высота: вне карты', 'Местность: вне карты', 'Лес: вне карты']
      : ['Height: outside map', 'Terrain: outside map', 'Forest: outside map'];
  }

  if (locale === 'ru') {
    return [
      `Высота: ${formatElevationLevel(cell.height, locale)}`,
      `Местность: ${formatTerrainKind(cell.terrain, locale)}`,
      `Лес: ${formatForestLayer(cell.forest, locale)}`,
    ];
  }

  return [
    `Height: ${formatElevationLevel(cell.height, locale)}`,
    `Terrain: ${formatTerrainKind(cell.terrain, locale)}`,
    `Forest: ${formatForestLayer(cell.forest, locale)}`,
  ];
}

function formatElevationLevel(height: number, locale: Locale): string {
  const prefix = height > 0 ? '+' : '';
  const nameRu: Record<number, string> = {
    [-2]: 'глубокая низина',
    [-1]: 'низина',
    0: 'ровно',
    1: 'лёгкий подъём',
    2: 'холм',
    3: 'высокая местность',
    4: 'гребень / вершина',
  };
  const nameEn: Record<number, string> = {
    [-2]: 'deep low ground',
    [-1]: 'low ground',
    0: 'flat',
    1: 'rise',
    2: 'hill',
    3: 'high ground',
    4: 'ridge / crest',
  };

  return `${prefix}${height} — ${(locale === 'ru' ? nameRu : nameEn)[height] ?? 'unknown'}`;
}

function formatTerrainKind(terrain: string, locale: Locale): string {
  const ru: Record<string, string> = {
    field: 'поле / открытая земля',
    forest: 'лесная местность',
    road: 'дорога',
    swamp: 'болото',
    rough: 'пересечённая местность',
    water: 'вода',
  };
  const en: Record<string, string> = {
    field: 'field / open ground',
    forest: 'forest terrain',
    road: 'road',
    swamp: 'swamp',
    rough: 'rough ground',
    water: 'water',
  };

  return (locale === 'ru' ? ru : en)[terrain] ?? terrain;
}

function formatForestLayer(forest: number, locale: Locale): string {
  const ru: Record<number, string> = {
    0: 'нет',
    1: 'редкий лес',
    2: 'густой лес',
  };
  const en: Record<number, string> = {
    0: 'none',
    1: 'sparse forest',
    2: 'dense forest',
  };

  return (locale === 'ru' ? ru : en)[forest] ?? String(forest);
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

function buildTimestampForFileName(): string {
  return new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')
    .replace('T', '_')
    .replace('Z', '');
}
