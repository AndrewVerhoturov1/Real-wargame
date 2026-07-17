import type { TacticalMapData } from '../map/MapModel';
import type { PressureZoneData } from '../pressure/PressureZone';
import { normalizePressureZones } from '../pressure/PressureZone';
import { createInitialState, type SimulationState } from './SimulationState';
import { normalizeUnits, type UnitData } from '../units/UnitModel';

export const DEFAULT_RUNTIME_METERS_PER_CELL = 2;

export function createResolutionAwareInitialState(
  mapData: TacticalMapData,
  unitsData: UnitData[],
  pressureZoneData: PressureZoneData[] = [],
  preferredRuntimeMetersPerCell = DEFAULT_RUNTIME_METERS_PER_CELL,
): SimulationState {
  const sourceMetersPerCell = normalizeMetersPerCell(mapData.metersPerCell, 10);
  const requestedRuntimeMetersPerCell = normalizeMetersPerCell(
    mapData.runtimeMetersPerCell,
    Math.min(sourceMetersPerCell, preferredRuntimeMetersPerCell),
  );
  const runtimeMetersPerCell = Math.min(sourceMetersPerCell, requestedRuntimeMetersPerCell);
  const state = createInitialState(
    { ...mapData, runtimeMetersPerCell },
    [],
    [],
  );
  const scale = state.map.sourceToRuntimeCellScale;
  state.units = normalizeUnits(unitsData, scale);
  state.pressureZones = normalizePressureZones(pressureZoneData, scale);
  applyPhysicalEditorDefaults(state);
  return state;
}

export function replaceSceneAtRuntimeResolution(
  state: SimulationState,
  mapData: TacticalMapData,
  unitsData: UnitData[],
  pressureZoneData: PressureZoneData[] = [],
  preferredRuntimeMetersPerCell = DEFAULT_RUNTIME_METERS_PER_CELL,
): void {
  const loaded = createResolutionAwareInitialState(
    mapData,
    unitsData,
    pressureZoneData,
    preferredRuntimeMetersPerCell,
  );
  state.map = loaded.map;
  state.units = loaded.units;
  state.pressureZones = loaded.pressureZones;
  state.movementProfiles = loaded.movementProfiles;
  state.selectedUnitId = null;
  state.selectedUnitIds = [];
  state.mouseGridPosition = null;
  state.selectionBox = null;
  state.simulationTimeSeconds = 0;
  state.editor.zoneRadiusCells = loaded.editor.zoneRadiusCells;
  state.editor.zoneWidthCells = loaded.editor.zoneWidthCells;
  state.editor.zoneHeightCells = loaded.editor.zoneHeightCells;
  state.editor.objectWidthCells = loaded.editor.objectWidthCells;
  state.editor.objectHeightCells = loaded.editor.objectHeightCells;
}

function applyPhysicalEditorDefaults(state: SimulationState): void {
  state.editor.zoneRadiusCells = metersToCells(state, 30);
  state.editor.zoneWidthCells = metersToCells(state, 50);
  state.editor.zoneHeightCells = metersToCells(state, 30);
  state.editor.objectWidthCells = metersToCells(state, 2);
  state.editor.objectHeightCells = metersToCells(state, 2);
}

function metersToCells(state: SimulationState, meters: number): number {
  return meters / Math.max(0.001, state.map.metersPerCell);
}

function normalizeMetersPerCell(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return fallback;
  return Math.max(0.25, Math.min(100, value as number));
}
