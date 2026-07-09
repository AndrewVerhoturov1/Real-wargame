import './styles.css';
import './ai-game-bridge.css';
import './ui-layout.css';
import mapData from './data/maps/test_map.json';
import pressureZoneData from './data/pressure_zones/test_pressure_zones.json';
import unitsData from './data/units/test_units.json';
import { installAiGameBridge } from './core/ai/AiGameBridge';
import type { TacticalMapData } from './core/map/MapModel';
import type { PressureZoneData } from './core/pressure/PressureZone';
import { createInitialState } from './core/simulation/SimulationState';
import type { UnitData } from './core/units/UnitModel';
import { PixiTacticalBoardApp } from './rendering/PixiApp';
import { installEditorControls } from './ui/EditorControls';
import { installGameHudControls } from './ui/GameHudControls';
import { installPerformanceReportControls } from './ui/PerformanceReportControls';
import { installSceneExportControls } from './ui/SceneExportControls';
import { installTerrainBrushControls } from './ui/TerrainBrushControls';

const root = document.querySelector<HTMLElement>('#app');
const debugPanel = document.querySelector<HTMLElement>('#debug-panel');
const languageToggle = document.querySelector<HTMLButtonElement>('#language-toggle');
const gridToggle = document.querySelector<HTMLButtonElement>('#grid-toggle');
const visionToggle = document.querySelector<HTMLButtonElement>('#vision-toggle');
const heightToggle = document.querySelector<HTMLButtonElement>('#height-toggle');
const aiEditorOpenButton = document.querySelector<HTMLButtonElement>('#ai-editor-open');

if (!root || !debugPanel || !languageToggle || !gridToggle || !visionToggle || !heightToggle || !aiEditorOpenButton) {
  throw new Error('Tactical board root elements are missing.');
}

const state = createInitialState(
  mapData as TacticalMapData,
  unitsData as UnitData[],
  pressureZoneData as PressureZoneData[],
);
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
  gridToggle.setAttribute('aria-pressed', 'true');
  visionToggle.setAttribute('aria-pressed', 'false');
  heightToggle.setAttribute('aria-pressed', 'false');
  gridToggle.classList.remove('hud-toggle-off');
  visionToggle.classList.add('hud-toggle-off');
  heightToggle.classList.add('hud-toggle-off');
}

function installAiEditorOpenButton(button: HTMLButtonElement): void {
  button.addEventListener('click', () => {
    window.open('/ai-node-editor.html', '_blank', 'noopener,noreferrer');
  });
}
