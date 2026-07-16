import './styles.css';
import './ai-game-bridge.css';
import './ai-test-lab.css';
import './game-editor.css';
import './ui-layout.css';
import './tactical-workspace.css';
import './tactical-workspace-mode.css';
import './tactical-workspace-compact-route.css';
import './front-zones.css';
import './ai-dictionary.css';
import './ai-dictionary-compat.css';
import './command-plan-route-overlay.css';
import './route-cost-overlay.css';
import './perception-attention.css';
import mapData from './data/maps/test_map.json';
import pressureZoneData from './data/pressure_zones/test_pressure_zones.json';
import unitsData from './data/units/test_units.json';
import { installAiStatefulMoveGameBridge as installAiGameBridge } from './core/ai/AiStatefulMoveGameBridge';
import type { TacticalMapData } from './core/map/MapModel';
import {
  getEnvironmentProfileRegistry,
  subscribeEnvironmentProfileRegistry,
} from './core/map/EnvironmentProfileStorage';
import type { PressureZoneData } from './core/pressure/PressureZone';
import { createResolutionAwareInitialState } from './core/simulation/ResolutionAwareScene';
import { initializeAiTestLabRuntime } from './core/testing/AiTestLabRuntime';
import type { UnitData } from './core/units/UnitModel';
import { installAdaptiveGridLod } from './rendering/AdaptiveGridLodInstaller';
import { installAttentionOverlayRenderer } from './rendering/AttentionOverlayInstaller';
import { installCombatEffectsRenderer } from './rendering/CombatEffectsInstaller';
import { PixiTacticalBoardApp } from './rendering/PixiApp';
import { installAppShellMenu } from './shared/AppShellMenu';
import { installAiStatePlanVisualQaHarness } from './testing/AiStatePlanVisualQaHarness';
import { installCombatTacticalIntegrationVisualQaHarness } from './testing/CombatTacticalIntegrationVisualQaHarness';
import { installDangerLayerMovementPerformanceHarness } from './testing/DangerLayerMovementPerformanceHarness';
import { installAiDictionaryGameIntegration } from './ui/AiDictionaryGameIntegration';
import { installAttentionProfileControls } from './ui/AttentionProfileControls';
import { installAttentionRuntimePanel } from './ui/AttentionRuntimePanel';
import { installCombatControls } from './ui/CombatControls';
import { installCommandPlanRouteUi } from './ui/CommandPlanRouteUi';
import { installRouteCostOverlayUi } from './ui/RouteCostOverlayUi';
import { installEditorHeaderPlacement } from './ui/EditorHeaderPlacement';
import { installFrontZoneControls } from './ui/FrontZoneControls';
import { installGameEditorWorkbench } from './ui/GameEditorWorkbench';
import { installPerformanceReportControls } from './ui/PerformanceReportControls';
import { installSceneExportControls } from './ui/SceneExportControls';
import { installTacticalWorkspace } from './ui/TacticalWorkspace';
import { installWorkspaceTooltipGuard } from './ui/WorkspaceTooltipGuard';

const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
let state: ReturnType<typeof createResolutionAwareInitialState>;
let tacticalBoard: PixiTacticalBoardApp | null = null;
type PausableRuntimeState = typeof state & { paused?: boolean };

const root = document.querySelector<HTMLElement>('#app')!;
const debugPanel = document.querySelector<HTMLElement>('#debug-panel')!;
const languageToggle = document.querySelector<HTMLButtonElement>('#language-toggle')!;
const gridToggle = document.querySelector<HTMLButtonElement>('#grid-toggle')!;
const visionToggle = document.querySelector<HTMLButtonElement>('#vision-toggle')!;
const heightToggle = document.querySelector<HTMLButtonElement>('#height-toggle')!;
const pauseToggle = document.querySelector<HTMLButtonElement>('#pause-toggle')!;
const aiEditorOpenButton = document.querySelector<HTMLButtonElement>('#ai-editor-open')!;

if (!root || !debugPanel || !languageToggle || !gridToggle || !visionToggle || !heightToggle || !pauseToggle || !aiEditorOpenButton) {
  throw new Error('Tactical board root elements are missing.');
}

installAppShellMenu({ mode: 'game' });

const environmentProfileRegistry = getEnvironmentProfileRegistry();

state = createResolutionAwareInitialState(
  mapData as TacticalMapData,
  unitsData as UnitData[],
  pressureZoneData as PressureZoneData[],
);
state.map.environmentProfileId = environmentProfileRegistry.activeProfileId;
initializeAiTestLabRuntime(state);

void bootstrap().catch(reportBootstrapFailure);

async function bootstrap(): Promise<void> {
  const board = await PixiTacticalBoardApp.create(
    root,
    debugPanel,
    languageToggle,
    gridToggle,
    visionToggle,
    heightToggle,
    state,
  );
  tacticalBoard = board;
  const aiGameBridge = installAiGameBridge(state);
  const destroyEnvironmentProfileSubscription = subscribeEnvironmentProfileRegistry((registry) => {
    state.map.environmentProfileId = registry.activeProfileId;
    board.forceRender();
  });
  const forceRenderAtNativeMapQuality = () => {
    board.forceRender();
    enforceNativeMapQuality(board);
  };

  installGameEditorWorkbench(debugPanel, state, forceRenderAtNativeMapQuality);
  const destroyAttentionProfileControls = installAttentionProfileControls(state, forceRenderAtNativeMapQuality);
  installSceneExportControls(state);
  installPerformanceReportControls(() => board.downloadPerformanceReport());
  installAiEditorOpenButton(aiEditorOpenButton);
  installPauseToggle(pauseToggle, forceRenderAtNativeMapQuality);
  installTacticalWorkspace(state, aiGameBridge, forceRenderAtNativeMapQuality);
  const destroyCombatControls = installCombatControls(state, forceRenderAtNativeMapQuality);
  installAiStatePlanVisualQaHarness(state, forceRenderAtNativeMapQuality);
  installCombatTacticalIntegrationVisualQaHarness(state, forceRenderAtNativeMapQuality);
  installDangerLayerMovementPerformanceHarness(state);
  const destroyAttentionRuntimePanel = installAttentionRuntimePanel(state, forceRenderAtNativeMapQuality);
  const destroyAttentionOverlayRenderer = installAttentionOverlayRenderer(board, state);
  const destroyCombatEffectsRenderer = installCombatEffectsRenderer(tacticalBoard, state);
  const destroyCommandPlanRouteUi = installCommandPlanRouteUi(state, forceRenderAtNativeMapQuality);
  const destroyRouteCostOverlayUi = installRouteCostOverlayUi(state, forceRenderAtNativeMapQuality);
  const destroyAiDictionary = installAiDictionaryGameIntegration(state, forceRenderAtNativeMapQuality);
  const destroyFrontZoneControls = installFrontZoneControls(state, forceRenderAtNativeMapQuality);
  const destroyEditorHeaderPlacement = installEditorHeaderPlacement();
  const destroyWorkspaceTooltipGuard = installWorkspaceTooltipGuard();
  board.start();
  const destroyAdaptiveGridLod = installAdaptiveGridLod(board, state, gridToggle);
  enforceNativeMapQuality(board);
  gridToggle.addEventListener('click', scheduleNativeMapQuality);
  // Pixi starts with the legacy English locale; switch once after its listener is installed.
  languageToggle.click();
  forceRussianTopControls(
    languageToggle,
    gridToggle,
    visionToggle,
    heightToggle,
    pauseToggle,
    aiEditorOpenButton,
  );

  window.addEventListener('beforeunload', () => {
    gridToggle.removeEventListener('click', scheduleNativeMapQuality);
    destroyEnvironmentProfileSubscription();
    destroyAdaptiveGridLod();
    destroyCommandPlanRouteUi();
    destroyRouteCostOverlayUi();
    destroyAiDictionary();
    destroyFrontZoneControls();
    destroyWorkspaceTooltipGuard();
    destroyEditorHeaderPlacement();
    destroyCombatControls();
    destroyCombatEffectsRenderer();
    destroyAttentionRuntimePanel();
    destroyAttentionOverlayRenderer();
    destroyAttentionProfileControls();
    aiGameBridge.destroy();
    board.destroy();
    if (tacticalBoard === board) tacticalBoard = null;
    clearNativeMapQualityDiagnostics();
  });
}

function scheduleNativeMapQuality(): void {
  const board = tacticalBoard;
  if (!board) return;
  window.requestAnimationFrame(() => {
    if (tacticalBoard === board) enforceNativeMapQuality(board);
  });
}

function reportBootstrapFailure(error: unknown): void {
  const board = tacticalBoard;
  tacticalBoard = null;
  try {
    board?.destroy();
  } catch (destroyError) {
    console.error('Failed to clean up the tactical board after bootstrap failure.', destroyError);
  }
  clearNativeMapQualityDiagnostics();
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to start the tactical board.', error);
  debugPanel.setAttribute('role', 'alert');
  debugPanel.textContent = `Не удалось запустить тактическую карту.\n${message}`;
  root.dataset.bootstrapState = 'failed';
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

function forceRussianTopControls(
  languageButton: HTMLButtonElement,
  gridButton: HTMLButtonElement,
  visionButton: HTMLButtonElement,
  heightButton: HTMLButtonElement,
  pauseButton: HTMLButtonElement,
  aiEditorButton: HTMLButtonElement,
): void {
  document.documentElement.lang = 'ru';
  languageButton.textContent = 'Русский';
  gridButton.textContent = 'Сетка: вкл';
  visionButton.textContent = 'Обзор: выкл';
  heightButton.textContent = 'Цифры высоты: выкл';
  aiEditorButton.textContent = 'Редактор ИИ';
  updatePauseToggle(pauseButton);
  gridButton.setAttribute('aria-pressed', 'true');
  visionButton.setAttribute('aria-pressed', 'false');
  heightButton.setAttribute('aria-pressed', 'false');
  gridButton.classList.remove('hud-toggle-off');
  visionButton.classList.add('hud-toggle-off');
  heightButton.classList.add('hud-toggle-off');
}

function installAiEditorOpenButton(button: HTMLButtonElement): void {
  button.addEventListener('click', () => {
    window.open('/ai-node-editor.html', '_blank');
  });
}

function installPauseToggle(button: HTMLButtonElement, onChanged: () => void): void {
  button.addEventListener('click', () => {
    togglePause(button, onChanged);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'p') return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    togglePause(button, onChanged);
  });
}

function togglePause(button: HTMLButtonElement, onChanged: () => void): void {
  setPaused(!getPaused());
  updatePauseToggle(button);
  syncPauseStateToDebugTrace();
  onChanged();
}

function getPaused(): boolean {
  return Boolean((state as PausableRuntimeState).paused);
}

function setPaused(value: boolean): void {
  (state as PausableRuntimeState).paused = value;
}

function updatePauseToggle(button: HTMLButtonElement): void {
  const paused = getPaused();
  button.textContent = paused ? 'Пауза: вкл' : 'Пауза: выкл';
  button.setAttribute('aria-pressed', String(paused));
  button.classList.toggle('hud-toggle-off', !paused);
}

function syncPauseStateToDebugTrace(): void {
  try {
    const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.kind !== 'ai-graph-runtime-debug') return;
    parsed.paused = getPaused();
    window.localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Debug state is optional; pause must keep working even if localStorage is unavailable.
  }
}
