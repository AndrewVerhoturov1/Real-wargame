import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

export const AI_TEST_TIME_SCALES = [0.25, 0.5, 1, 2, 4, 10] as const;
export type AiTestTimeScale = (typeof AI_TEST_TIME_SCALES)[number];

type PausableSimulationState = SimulationState & { paused?: boolean };

interface SceneSnapshot {
  map: SimulationState['map'];
  units: SimulationState['units'];
  pressureZones: SimulationState['pressureZones'];
}

interface LabRuntime {
  timeScale: AiTestTimeScale;
  initialScene: SceneSnapshot;
  unitSnapshots: Map<string, UnitModel>;
}

const runtimes = new WeakMap<SimulationState, LabRuntime>();

export function initializeAiTestLabRuntime(state: SimulationState): void {
  runtimes.set(state, {
    timeScale: 1,
    initialScene: snapshotScene(state),
    unitSnapshots: new Map(state.units.map((unit) => [unit.id, clone(unit)])),
  });
}

export function refreshAiTestLabSceneSnapshot(state: SimulationState): void {
  const runtime = getRuntime(state);
  runtime.initialScene = snapshotScene(state);
  runtime.unitSnapshots = new Map(state.units.map((unit) => [unit.id, clone(unit)]));
}

export function rememberSelectedUnitForTest(state: SimulationState): void {
  const unit = getSelectedUnit(state);
  if (!unit) return;

  const runtime = getRuntime(state);
  if (!runtime.unitSnapshots.has(unit.id)) {
    runtime.unitSnapshots.set(unit.id, clone(unit));
  }
}

export function resetSelectedUnitForTest(state: SimulationState): boolean {
  const selectedId = state.selectedUnitId;
  if (!selectedId) return false;

  const runtime = getRuntime(state);
  const snapshot = runtime.unitSnapshots.get(selectedId);
  const index = state.units.findIndex((unit) => unit.id === selectedId);
  if (!snapshot || index < 0) return false;

  state.units[index] = clone(snapshot);
  state.selectedUnitId = selectedId;
  state.selectedUnitIds = [selectedId];
  return true;
}

export function resetAiTestScene(state: SimulationState): void {
  const runtime = getRuntime(state);
  const snapshot = clone(runtime.initialScene);
  state.map = snapshot.map;
  state.units = snapshot.units;
  state.pressureZones = snapshot.pressureZones;
  state.selectedUnitId = null;
  state.selectedUnitIds = [];
  state.selectionBox = null;
  state.editor.selectedObjectId = null;
  state.editor.selectedZoneId = null;
  state.editor.drag = null;
  state.editor.tool = 'select';
  runtime.unitSnapshots = new Map(state.units.map((unit) => [unit.id, clone(unit)]));
}

export function getAiTestTimeScale(state: SimulationState): AiTestTimeScale {
  return getRuntime(state).timeScale;
}

export function setAiTestTimeScale(state: SimulationState, value: number): AiTestTimeScale {
  const closest = AI_TEST_TIME_SCALES.reduce((best, candidate) => (
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  ));
  getRuntime(state).timeScale = closest;
  return closest;
}

export function getAiTestPaused(state: SimulationState): boolean {
  return Boolean((state as PausableSimulationState).paused);
}

export function setAiTestPaused(state: SimulationState, value: boolean): void {
  (state as PausableSimulationState).paused = value;
}

function getRuntime(state: SimulationState): LabRuntime {
  let runtime = runtimes.get(state);
  if (!runtime) {
    initializeAiTestLabRuntime(state);
    runtime = runtimes.get(state);
  }
  if (!runtime) throw new Error('AI test lab runtime was not initialized.');
  return runtime;
}

function getSelectedUnit(state: SimulationState): UnitModel | undefined {
  return state.selectedUnitId
    ? state.units.find((unit) => unit.id === state.selectedUnitId)
    : undefined;
}

function snapshotScene(state: SimulationState): SceneSnapshot {
  return clone({
    map: state.map,
    units: state.units,
    pressureZones: state.pressureZones,
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
