import './styles.css';
import './ai-game-bridge.css';
import './ai-test-lab.css';
import './shared/app-shell-menu.css';
import './ui-layout.css';
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
import { installAiTestLabControls } from './ui/AiTestLabControls';
import { installEditorControls } from './ui/EditorControls';
import { installGameHudControls } from './ui/GameHudControls';
import { installPerformanceReportControls } from './ui/PerformanceReportControls';
import { installSceneExportControls } from './ui/SceneExportControls';
import { installTerrainBrushControls } from './ui/TerrainBrushControls';

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

installGameHudControls(state);
installEditorControls(debugPanel, state);
installTerrainBrushControls(debugPanel, state);
installSceneExportControls(state);
installPerformanceReportControls(() => tacticalBoard.downloadPerformanceReport());
installAiEditorOpenButton(aiEditorOpenButton);
installPauseToggle(pauseToggle, () => tacticalBoard.forceRender());
installAiTestLabControls(state, aiGameBridge, () => {
  updatePauseToggle(pauseToggle);
  tacticalBoard.forceRender();
});
tacticalBoard.start();
forceRussianTopControls();

window.addEventListener('beforeunload', () => {
  aiGameBridge.destroy();
  tacticalBoard.destroy();
});

function forceRussianTopControls(): void {
  document.documentElement.lang = 'ru';
  languageToggle.textContent = 'Русский';
  gridToggle.textContent = 'Сетка: вкл';
  visionToggle.textContent = 'Обзор: выкл';
  heightToggle.textContent = 'Цифры высоты: выкл';
  aiEditorOpenButton.textContent = 'Редактор ИИ';
  updatePauseToggle(pauseToggle);
  gridToggle.setAttribute('aria-pressed', 'true');
  visionToggle.setAttribute('aria-pressed', 'false');
  heightToggle.setAttribute('aria-pressed', 'false');
  gridToggle.classList.remove('hud-toggle-off');
  visionToggle.classList.add('hud-toggle-off');
  heightToggle.classList.add('hud-toggle-off');
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
