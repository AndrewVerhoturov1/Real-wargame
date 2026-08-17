import type { Container, Ticker } from 'pixi.js';
import { installAiStatefulMoveGameBridge as installAiGameBridge } from '../core/ai/AiStatefulMoveGameBridge';
import {
  getMovementProfileRegistry,
  subscribeMovementProfileRegistry,
} from '../ai-node-editor/MovementProfileBrowserStorage';
import { installEnvironmentMovementMaterialProvider } from '../core/movement/MovementMaterialAdapter';
import { clearAsyncRouteCostWorker } from '../core/navigation/RouteCostWorkerClient';
import type { SimulationState } from '../core/simulation/SimulationState';
import {
  clearTacticalPositionSearchService,
  installTacticalPositionSearchService,
  TacticalPositionSearchService,
} from '../core/tactical/TacticalPositionSearchService';
import { initializeAiTestLabRuntime } from '../core/testing/AiTestLabRuntime';
import { installTacticalOrderRadialInput } from '../input/TacticalOrderRadialInput';
import { installAdaptiveGridLod } from '../rendering/AdaptiveGridLodInstaller';
import { installAttentionOverlayRenderer } from '../rendering/AttentionOverlayInstaller';
import { installCombatEffectsRenderer } from '../rendering/CombatEffectsInstaller';
import { PixiTacticalBoardApp } from '../rendering/PixiApp';
import { createPixiTacticalBoardAdapter } from '../rendering/PixiTacticalBoardAdapter';
import { installAwarenessLayerFieldController } from '../runtime/AwarenessLayerFieldController';
import { AwarenessWorldRuntime } from '../runtime/AwarenessWorldRuntime';
import { installAiStatePlanVisualQaHarness } from '../testing/AiStatePlanVisualQaHarness';
import { installCombatTacticalIntegrationVisualQaHarness } from '../testing/CombatTacticalIntegrationVisualQaHarness';
import { installDangerLayerMovementPerformanceHarness } from '../testing/DangerLayerMovementPerformanceHarness';
import { installLiveWindowsPerformanceHarness } from '../testing/LiveWindowsPerformanceHarness';
import { installAiDictionaryGameIntegration } from '../ui/AiDictionaryGameIntegration';
import { installAttentionProfileControls } from '../ui/AttentionProfileControls';
import { installAttentionRuntimePanel } from '../ui/AttentionRuntimePanel';
import { installCombatControls } from '../ui/CombatControls';
import { installCommandPlanRouteUi } from '../ui/CommandPlanRouteUi';
import { installEditorHeaderPlacement } from '../ui/EditorHeaderPlacement';
import {
  getEnvironmentProfileRegistry,
  saveEnvironmentProfileRegistry,
  subscribeEnvironmentProfileRegistry,
} from '../ui/EnvironmentProfileStorage';
import { installFrontZoneControls } from '../ui/FrontZoneControls';
import { installGameEditorWorkbench } from '../ui/GameEditorWorkbench';
import { installPerformanceReportControls } from '../ui/PerformanceReportControls';
import { installRouteCostOverlayUi } from '../ui/RouteCostOverlayUi';
import { installSceneExportControls } from '../ui/SceneExportControls';
import { installTacticalWorkspace } from '../ui/TacticalWorkspace';
import { installWorkspaceTooltipGuard } from '../ui/WorkspaceTooltipGuard';
import type {
  GameApplicationContext,
  GameApplicationElements,
  GameApplicationExtension,
  GameApplicationOptions,
  GamePauseController,
} from './GameApplicationTypes';

const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
type PausableSimulationState = SimulationState & { paused?: boolean };
type Destroyer = () => void;

export class GameApplication {
  private readonly state: SimulationState;
  private readonly elements: GameApplicationElements;
  private readonly board: PixiTacticalBoardApp;
  private readonly adapter: ReturnType<typeof createPixiTacticalBoardAdapter>;
  private readonly pauseController: GamePauseController;
  private readonly destroyers: Destroyer[] = [];
  private readonly stateBoundDestroyers: Destroyer[] = [];
  private extension: GameApplicationExtension | null = null;
  private awarenessWorldRuntime: AwarenessWorldRuntime | null = null;
  private tacticalPositionSearchService: TacticalPositionSearchService | null = null;
  private boundMap: SimulationState['map'];
  private destroyed = false;

  private constructor(
    private readonly options: GameApplicationOptions,
    board: PixiTacticalBoardApp,
  ) {
    this.state = options.state;
    this.elements = options.elements;
    this.board = board;
    this.adapter = createPixiTacticalBoardAdapter(board);
    this.pauseController = options.pauseController ?? createStatePauseController(this.state);
    this.boundMap = this.state.map;
  }

  static async create(options: GameApplicationOptions): Promise<GameApplication> {
    validateElements(options.elements);
    prepareGameState(options.state);
    document.body.dataset.gameApplicationMode = options.mode;

    let board: PixiTacticalBoardApp | null = null;
    try {
      board = await PixiTacticalBoardApp.create(
        options.elements.root,
        options.elements.debugPanel,
        options.elements.languageToggle,
        options.elements.gridToggle,
        options.elements.visionToggle,
        options.elements.heightToggle,
        options.state,
      );
      const application = new GameApplication(options, board);
      await application.install();
      options.elements.root.dataset.bootstrapState = 'ready';
      return application;
    } catch (error) {
      try {
        board?.destroy();
      } catch (destroyError) {
        console.error('Failed to clean up the tactical board after bootstrap failure.', destroyError);
      }
      reportBootstrapFailure(options.elements, error);
      throw error;
    }
  }

  get context(): GameApplicationContext {
    return {
      state: this.state,
      board: this.board,
      forceRender: this.forceRender,
      addTickerListener: this.addTickerListener,
      getWorldContainer: this.getWorldContainer,
      restartStateBoundServices: () => this.restartStateBoundServices(),
    };
  }

  restartStateBoundServices(): void {
    if (this.destroyed) return;
    this.destroyStateBoundServices();
    prepareGameState(this.state);
    this.installStateBoundServices();
    this.forceRender();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    try {
      this.extension?.destroy();
    } finally {
      this.extension = null;
    }
    for (let index = this.destroyers.length - 1; index >= 0; index -= 1) {
      safelyDestroy(this.destroyers[index]!);
    }
    this.destroyers.length = 0;
    this.destroyStateBoundServices();
    this.board.destroy();
    clearNativeMapQualityDiagnostics();
    delete document.body.dataset.gameApplicationMode;
  }

  private async install(): Promise<void> {
    const { debugPanel, gridToggle, languageToggle, visionToggle, heightToggle, pauseToggle, aiEditorOpenButton } = this.elements;
    const forceRenderAtNativeMapQuality = this.forceRender;
    const refreshTacticalOrderUi = () => this.board.renderNow();

    this.installStateBoundServices();

    const aiGameBridge = installAiGameBridge(this.state);
    this.destroyers.push(() => aiGameBridge.destroy());

    this.destroyers.push(subscribeEnvironmentProfileRegistry((registry) => {
      this.state.map.environmentProfileId = registry.activeProfileId;
      installEnvironmentMovementMaterialProvider(this.state);
      this.forceRender();
    }));
    this.destroyers.push(subscribeMovementProfileRegistry((registry) => {
      this.state.movementProfiles = registry;
    }));

    installGameEditorWorkbench(debugPanel, this.state, forceRenderAtNativeMapQuality);
    pushDestroyer(this.destroyers, installAttentionProfileControls(this.state, forceRenderAtNativeMapQuality));
    installSceneExportControls(this.state);
    installPerformanceReportControls(() => this.board.downloadPerformanceReport());
    this.destroyers.push(installAiEditorOpenButton(aiEditorOpenButton));
    this.destroyers.push(installPauseToggle(pauseToggle, this.pauseController, forceRenderAtNativeMapQuality));
    pushDestroyer(this.destroyers, installTacticalWorkspace(this.state, aiGameBridge, forceRenderAtNativeMapQuality));
    pushDestroyer(this.destroyers, installCombatControls(this.state, forceRenderAtNativeMapQuality));
    installAiStatePlanVisualQaHarness(this.state, forceRenderAtNativeMapQuality);
    installCombatTacticalIntegrationVisualQaHarness(this.state, forceRenderAtNativeMapQuality);
    installDangerLayerMovementPerformanceHarness(this.state);
    installLiveWindowsPerformanceHarness(this.state);
    pushDestroyer(this.destroyers, installAttentionRuntimePanel(this.state, forceRenderAtNativeMapQuality));
    pushDestroyer(this.destroyers, installCommandPlanRouteUi(this.state, forceRenderAtNativeMapQuality));
    pushDestroyer(this.destroyers, installRouteCostOverlayUi(this.state, forceRenderAtNativeMapQuality));
    pushDestroyer(this.destroyers, installAiDictionaryGameIntegration(this.state, forceRenderAtNativeMapQuality));
    pushDestroyer(this.destroyers, installFrontZoneControls(this.state, forceRenderAtNativeMapQuality));
    pushDestroyer(this.destroyers, installEditorHeaderPlacement());
    pushDestroyer(this.destroyers, installWorkspaceTooltipGuard());

    this.board.start();
    pushDestroyer(this.destroyers, installTacticalOrderRadialInput(
      this.board,
      this.state,
      refreshTacticalOrderUi,
      this.options.entityContextMenuRoutes,
    ));

    const scheduleNativeMapQuality = () => {
      window.requestAnimationFrame(() => {
        if (!this.destroyed) enforceNativeMapQuality(this.board);
      });
    };
    gridToggle.addEventListener('click', scheduleNativeMapQuality);
    this.destroyers.push(() => gridToggle.removeEventListener('click', scheduleNativeMapQuality));

    enforceNativeMapQuality(this.board);
    languageToggle.click();
    forceRussianTopControls(
      languageToggle,
      gridToggle,
      visionToggle,
      heightToggle,
      pauseToggle,
      aiEditorOpenButton,
      this.pauseController,
    );

    if (this.options.installExtension) {
      this.extension = await this.options.installExtension(this.context);
    }
  }

  private installStateBoundServices(): void {
    const state = this.state;
    this.boundMap = state.map;
    const awarenessWorldRuntime = new AwarenessWorldRuntime();
    this.awarenessWorldRuntime = awarenessWorldRuntime;
    const tacticalPositionSearchService = new TacticalPositionSearchService(state, awarenessWorldRuntime);
    this.tacticalPositionSearchService = tacticalPositionSearchService;
    installTacticalPositionSearchService(state, tacticalPositionSearchService);

    this.stateBoundDestroyers.push(installAwarenessLayerFieldController(state, {
      requestWorldField: (unit) => awarenessWorldRuntime.requestWorldField(state, unit),
    }));
    this.stateBoundDestroyers.push(installCombatEffectsRenderer(this.board, state));
    this.stateBoundDestroyers.push(installAttentionOverlayRenderer(this.board, state));
    this.stateBoundDestroyers.push(installAdaptiveGridLod(this.board, state, this.elements.gridToggle));
  }

  private destroyStateBoundServices(): void {
    for (let index = this.stateBoundDestroyers.length - 1; index >= 0; index -= 1) {
      safelyDestroy(this.stateBoundDestroyers[index]!);
    }
    this.stateBoundDestroyers.length = 0;
    clearAsyncRouteCostWorker(this.boundMap);
    clearTacticalPositionSearchService(this.state);
    this.tacticalPositionSearchService?.destroy();
    this.tacticalPositionSearchService = null;
    this.awarenessWorldRuntime?.destroy();
    this.awarenessWorldRuntime = null;
  }

  private readonly forceRender = (): void => {
    if (this.destroyed) return;
    this.board.forceRender();
    enforceNativeMapQuality(this.board);
  };

  private readonly addTickerListener = (listener: (ticker: Ticker) => void): (() => void) => (
    this.adapter.addTickerListener(listener)
  );

  private readonly getWorldContainer = (): Container => this.adapter.getWorldContainer();
}

export function collectGameApplicationElements(documentRoot: ParentNode = document): GameApplicationElements {
  const elements: GameApplicationElements = {
    root: requiredElement(documentRoot, '#app'),
    debugPanel: requiredElement(documentRoot, '#debug-panel'),
    languageToggle: requiredElement(documentRoot, '#language-toggle'),
    gridToggle: requiredElement(documentRoot, '#grid-toggle'),
    visionToggle: requiredElement(documentRoot, '#vision-toggle'),
    heightToggle: requiredElement(documentRoot, '#height-toggle'),
    pauseToggle: requiredElement(documentRoot, '#pause-toggle'),
    aiEditorOpenButton: requiredElement(documentRoot, '#ai-editor-open'),
  };
  validateElements(elements);
  return elements;
}

function prepareGameState(state: SimulationState): void {
  const environmentProfileRegistry = getEnvironmentProfileRegistry();
  const requestedEnvironmentProfileId = typeof state.map.environmentProfileId === 'string'
    ? state.map.environmentProfileId.trim()
    : '';
  if (requestedEnvironmentProfileId && environmentProfileRegistry.hasProfile(requestedEnvironmentProfileId)) {
    environmentProfileRegistry.setActiveProfile(requestedEnvironmentProfileId);
    saveEnvironmentProfileRegistry(environmentProfileRegistry);
  }
  state.map.environmentProfileId = environmentProfileRegistry.activeProfileId;
  state.movementProfiles = getMovementProfileRegistry();
  installEnvironmentMovementMaterialProvider(state);
  initializeAiTestLabRuntime(state);
}

function createStatePauseController(state: SimulationState): GamePauseController {
  const pausable = state as PausableSimulationState;
  return {
    isPaused: () => Boolean(pausable.paused),
    toggle: () => { pausable.paused = !pausable.paused; },
    setPaused: (value) => { pausable.paused = value; },
  };
}

function installPauseToggle(
  button: HTMLButtonElement,
  controller: GamePauseController,
  onChanged: () => void,
): Destroyer {
  const update = () => updatePauseToggle(button, controller);
  const toggle = () => {
    controller.toggle();
    update();
    syncPauseStateToDebugTrace(controller);
    onChanged();
  };
  const onClick = () => toggle();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 'p') return;
    if (
      event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement
    ) return;
    toggle();
  };
  button.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown);
  update();
  return () => {
    button.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
  };
}

function installAiEditorOpenButton(button: HTMLButtonElement): Destroyer {
  const onClick = () => window.open('/ai-node-editor.html', '_blank');
  button.addEventListener('click', onClick);
  return () => button.removeEventListener('click', onClick);
}

function forceRussianTopControls(
  languageButton: HTMLButtonElement,
  gridButton: HTMLButtonElement,
  visionButton: HTMLButtonElement,
  heightButton: HTMLButtonElement,
  pauseButton: HTMLButtonElement,
  aiEditorButton: HTMLButtonElement,
  pauseController: GamePauseController,
): void {
  document.documentElement.lang = 'ru';
  languageButton.textContent = 'Русский';
  gridButton.textContent = 'Сетка: выкл';
  visionButton.textContent = 'Обзор: выкл';
  heightButton.textContent = 'Цифры высоты: выкл';
  aiEditorButton.textContent = 'Редактор ИИ';
  updatePauseToggle(pauseButton, pauseController);
  gridButton.setAttribute('aria-pressed', 'false');
  visionButton.setAttribute('aria-pressed', 'false');
  heightButton.setAttribute('aria-pressed', 'false');
  gridButton.classList.add('hud-toggle-off');
  visionButton.classList.add('hud-toggle-off');
  heightButton.classList.add('hud-toggle-off');
}

function updatePauseToggle(button: HTMLButtonElement, controller: GamePauseController): void {
  const paused = controller.isPaused();
  button.textContent = paused ? 'Пауза: вкл' : 'Пауза: выкл';
  button.setAttribute('aria-pressed', String(paused));
  button.classList.toggle('hud-toggle-off', !paused);
}

function syncPauseStateToDebugTrace(controller: GamePauseController): void {
  try {
    const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.kind !== 'ai-graph-runtime-debug') return;
    parsed.paused = controller.isPaused();
    window.localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Debug state is optional; pause must keep working if storage is unavailable.
  }
}

function enforceNativeMapQuality(board: PixiTacticalBoardApp): void {
  const internals = board as unknown as {
    mapRenderer?: { container?: { cacheAsTexture: (enabled: boolean) => void } };
  };
  const mapContainer = internals.mapRenderer?.container;
  if (mapContainer) mapContainer.cacheAsTexture(false);
  (window as Window & { __realWargameMapQualityDebug?: { cacheAsTexture: boolean } }).__realWargameMapQualityDebug = {
    cacheAsTexture: false,
  };
}

function clearNativeMapQualityDiagnostics(): void {
  delete (window as Window & { __realWargameMapQualityDebug?: { cacheAsTexture: boolean } }).__realWargameMapQualityDebug;
}

function validateElements(elements: GameApplicationElements): void {
  if (
    !elements.root
    || !elements.debugPanel
    || !elements.languageToggle
    || !elements.gridToggle
    || !elements.visionToggle
    || !elements.heightToggle
    || !elements.pauseToggle
    || !elements.aiEditorOpenButton
  ) throw new Error('Tactical board root elements are missing.');
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required game element is missing: ${selector}`);
  return element;
}

function pushDestroyer(target: Destroyer[], value: void | Destroyer): void {
  if (typeof value === 'function') target.push(value);
}

function safelyDestroy(destroyer: Destroyer): void {
  try {
    destroyer();
  } catch (error) {
    console.error('Game application teardown failed.', error);
  }
}

function reportBootstrapFailure(elements: GameApplicationElements, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to start the tactical board.', error);
  elements.debugPanel.setAttribute('role', 'alert');
  elements.debugPanel.textContent = `Не удалось запустить тактическую карту.\n${message}`;
  elements.root.dataset.bootstrapState = 'failed';
}
