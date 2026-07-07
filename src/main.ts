import './styles.css';
import mapData from './data/maps/test_map.json';
import pressureZoneData from './data/pressure_zones/test_pressure_zones.json';
import unitsData from './data/units/test_units.json';
import type { TacticalMapData } from './core/map/MapModel';
import type { PressureZoneData } from './core/pressure/PressureZone';
import { createInitialState } from './core/simulation/SimulationState';
import type { UnitData } from './core/units/UnitModel';
import { PixiTacticalBoardApp } from './rendering/PixiApp';
import { installPostureControls } from './ui/PostureControls';

const root = document.querySelector<HTMLElement>('#app');
const debugPanel = document.querySelector<HTMLElement>('#debug-panel');
const languageToggle = document.querySelector<HTMLButtonElement>('#language-toggle');
const gridToggle = document.querySelector<HTMLButtonElement>('#grid-toggle');
const visionToggle = document.querySelector<HTMLButtonElement>('#vision-toggle');

if (!root || !debugPanel || !languageToggle || !gridToggle || !visionToggle) {
  throw new Error('Tactical board root elements are missing.');
}

const state = createInitialState(
  mapData as TacticalMapData,
  unitsData as UnitData[],
  pressureZoneData as PressureZoneData[],
);
const tacticalBoard = new PixiTacticalBoardApp(root, debugPanel, languageToggle, gridToggle, visionToggle, state);

installPostureControls(debugPanel, state);
tacticalBoard.start();

window.addEventListener('beforeunload', () => {
  tacticalBoard.destroy();
});
