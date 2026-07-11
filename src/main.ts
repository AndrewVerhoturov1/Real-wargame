import './styles.css';
import './ai-game-bridge.css';
import './ai-test-lab.css';
import './game-editor.css';
import './ui-layout.css';
import './tactical-workspace.css';
import './tactical-workspace-mode.css';
import './front-zones.css';
import './ai-dictionary.css';
import './ai-dictionary-compat.css';
import mapData from './data/maps/test_map.json';
import pressureZoneData from './data/pressure_zones/test_pressure_zones.json';
import unitsData from './data/units/test_units.json';
import { installAiGameBridge } from './core/ai/AiGameBridge';
import type { TacticalMapData } from './core/map/MapModel';
import type { PressureZoneData } from './core/pressure/PressureZone';
import { createInitialState } from './core/simulation/SimulationState';
import { initializeAiTestLabRuntime } from './core/testing/AiTestLabRuntime';
import type { UnitData } from './core/units/UnitModel';
import { PixiTacticalBoardApp } from './rendering/PixiApp';
import { installAppShellMenu } from './shared/AppShellMenu';
import { installEditorHeaderPlacement } from './ui/EditorHeaderPlacement';
import { installFrontZoneControls } from './ui/FrontZoneControls';
import { installGameEditorWorkbench } from './ui/GameEditorWorkbench';
import { installPerformanceReportControls } from './ui/PerformanceReportControls';
import { installSceneExportControls } from './ui/SceneExportControls';
import { installTacticalWorkspace } from './ui/TacticalWorkspace';
import { installWorkspaceTooltipGuard } from './ui/WorkspaceTooltipGuard';
import { installAiDictionaryGameIntegration } from './ui/AiDictionaryGameIntegration';

const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';

const root = document.querySelector<HTMLElement>('#app');
const debugPanel = document.querySelector<HTMLElement>('#debug-panel');
const languageToggle = document.querySelector<HTMLButtonElement>('#language-toggle');
const gridToggle = document.querySelector<HTMLButtonElement>('#grid-toggle');
const visionToggle = document.querySelector<HTMLButtonElement>('#vision-toggle');
const heightToggle = document.querySelector<HTMLButtonElement>('#height-toggle');
const pauseToggle = document.querySelector<HTMLButtonElement>('#pause-toggle');
const aiEditorOpenButton = document.querySelector<HTMLButtonElement>('#ai-editor-open');

if (!root || !debugPanel || !languageToggle || !gridToggle || !visionToggle || !heightToggle || !pauseToggle || !aiEditorOpenButton) {
  throw new Error('Tactical board root elements are missing.');
}

installAppShellMenu({ mode: 'game' });

const state = createInitialState(
  mapData as TacticalMapData,
  unitsData as UnitData[],
  pressureZoneData as PressureZoneData[],
);
initializeAiTestLabRuntime(state);
type PausableRuntimeState = typeof state & { paused?: boolean };

const tacticalBoard = new PixiTacticalBoardApp(
  root,
  debugPanel,
  languageToggle,
  gridToggle,
  visionToggle,
  heightToggle,
  state,
);
const aiGameBridge = installAiGameBridge(state);
const forceRenderAtNativeMapQuality = () => {
  tacticalBoard.forceRender();
  enforceNativeMapQuality(tacticalBoard);
};

installGameEditorWorkbench(debugPanel, state, forceRenderAtNativeMapQuality);
installSceneExportControls(state);
installPerformanceReportControls(() => tacticalBoard.downloadPerformanceReport());
installAiEditorOpenButton(aiEditorOpenButton);
installPauseToggle(pauseToggle, forceRenderAtNativeMapQuality);
installTacticalWorkspace(state, aiGameBridge, forceRenderAtNativeMapQuality);
const destroyAiDictionary = installAiDictionaryGameIntegration(state, forceRenderAtNativeMapQuality);
const destroyFrontZoneControls = installFrontZoneControls(state, forceRenderAtNativeMapQuality);
const destroyEditorHeaderPlacement = installEditorHeaderPlacement();
const destroyWorkspaceTooltipGuard = installWorkspaceTooltipGuard();
tacticalBoard.start();
enforceNativeMapQuality(tacticalBoard);
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
  destroyAiDictionary();
  destroyFrontZoneControls();
  destroyWorkspaceTooltipGuard();
  destroyEditorHeaderPlacement();
  aiGameBridge.destroy();
  tacticalBoard.destroy();
});

function scheduleNativeMapQuality(): void {
  window.requestAnimationFrame(() => enforceNativeMapQuality(tacticalBoard));
}

function enforceNativeMapQuality(board: PixiTacticalBoardApp): void {
  const internals = board as unknown as {
    mapRenderer?: { container?: { cacheAsBitmap: boolean } };
  };
  const mapContainer = internals.mapRenderer?.container;
  if (mapContainer) mapContainer.cacheAsBitmap = false;
  (window as Window & { __realWargameMapQualityDebug?: { cacheAsBitmap: boolean } }).__realWargameMapQualityDebug = {
    cacheAsBitmap: mapContainer?.cacheAsBitmap ?? false,
  };
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
