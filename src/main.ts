import './styles.css';
import mapData from './data/maps/test_map.json';
import unitsData from './data/units/test_units.json';
import type { TacticalMapData } from './core/map/MapModel';
import { createInitialState } from './core/simulation/SimulationState';
import type { UnitData } from './core/units/UnitModel';
import { PixiTacticalBoardApp } from './rendering/PixiApp';

const root = document.querySelector<HTMLElement>('#app');
const debugPanel = document.querySelector<HTMLElement>('#debug-panel');
const languageToggle = document.querySelector<HTMLButtonElement>('#language-toggle');
const gridToggle = document.querySelector<HTMLButtonElement>('#grid-toggle');
const visionToggle = document.querySelector<HTMLButtonElement>('#vision-toggle');

if (!root || !debugPanel || !languageToggle || !gridToggle || !visionToggle) {
  throw new Error('Tactical board root elements are missing.');
}

const state = createInitialState(mapData as TacticalMapData, unitsData as UnitData[]);
const tacticalBoard = new PixiTacticalBoardApp(root, debugPanel, languageToggle, gridToggle, visionToggle, state);

tacticalBoard.start();

window.addEventListener('beforeunload', () => {
  tacticalBoard.destroy();
});
