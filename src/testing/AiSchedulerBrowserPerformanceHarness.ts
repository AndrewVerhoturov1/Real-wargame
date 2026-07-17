import {
  getAiSchedulerPerformanceDiagnostics,
  resetAiSchedulerPerformanceDiagnosticsForTests,
} from '../core/ai/AiSchedulerPerformanceDiagnostics';
import { resetPerformancePhaseRuntimeDiagnosticsForTests } from '../core/debug/PerformancePhases';
import type { SimulationState } from '../core/simulation/SimulationState';
import { setAiTestPaused } from '../core/testing/AiTestLabRuntime';
import { normalizeUnits, type UnitData } from '../core/units/UnitModel';

export interface AiSchedulerBrowserPerformanceSnapshot {
  readonly unitIds: readonly string[];
  readonly graphControlledUnitCount: number;
  readonly simulationStep: number;
  readonly simulationTimeSeconds: number;
  readonly diagnostics: ReturnType<typeof getAiSchedulerPerformanceDiagnostics>;
}

export interface AiSchedulerBrowserPerformanceApi {
  startSixUnitScenario(): AiSchedulerBrowserPerformanceSnapshot;
  getSnapshot(): AiSchedulerBrowserPerformanceSnapshot;
}

declare global {
  interface Window {
    __realWargameAiSchedulerPerformance?: AiSchedulerBrowserPerformanceApi;
  }
}

type PerformanceScenarioWindow = Window & {
  __realWargamePerformanceScenario?: string | null;
};

const UNIT_COUNT = 6;
const UNIT_PREFIX = 'scheduler-perf-unit-';

export function installAiSchedulerBrowserPerformanceHarness(
  state: SimulationState,
  onChanged: () => void,
): void {
  const query = new URLSearchParams(window.location.search);
  if (query.get('visualQa') !== 'ai-scheduler-performance') return;

  window.__realWargameAiSchedulerPerformance = {
    startSixUnitScenario(): AiSchedulerBrowserPerformanceSnapshot {
      state.units = normalizeUnits(buildFixtureUnits(state));
      state.pressureZones = [];
      state.selectedUnitId = state.units[0]?.id ?? null;
      state.selectedUnitIds = state.selectedUnitId ? [state.selectedUnitId] : [];
      state.simulationTimeSeconds = 0;
      state.simulationStep = 0;
      state.editor.enabled = false;
      state.editor.panelOpen = false;
      resetAiSchedulerPerformanceDiagnosticsForTests();
      resetPerformancePhaseRuntimeDiagnosticsForTests();
      performance.clearMeasures();
      (window as PerformanceScenarioWindow).__realWargamePerformanceScenario = 'ai-scheduler-six-units';
      setAiTestPaused(state, false);
      onChanged();
      window.dispatchEvent(new CustomEvent('real-wargame:ai-scheduler-performance-started'));
      return buildSnapshot(state);
    },
    getSnapshot(): AiSchedulerBrowserPerformanceSnapshot {
      return buildSnapshot(state);
    },
  };
}

function buildFixtureUnits(state: SimulationState): UnitData[] {
  const columns = 3;
  const rows = 2;
  const xSpacing = Math.max(3, Math.floor(state.map.width / (columns + 1)));
  const ySpacing = Math.max(3, Math.floor(state.map.height / (rows + 1)));
  return Array.from({ length: UNIT_COUNT }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: `${UNIT_PREFIX}${index + 1}`,
      label: `Scheduler unit ${index + 1}`,
      labelRu: `Юнит планировщика ${index + 1}`,
      type: index % 3 === 2 ? 'support_team' : index % 2 === 1 ? 'scout_team' : 'infantry_squad',
      side: index < 3 ? 'blue' : 'red',
      aiControl: 'graph',
      x: clampCell((column + 1) * xSpacing, state.map.width),
      y: clampCell((row + 1) * ySpacing, state.map.height),
      facingDegrees: index < 3 ? 0 : 180,
      speedCellsPerSecond: 0.75,
      viewRangeCells: Math.max(7, Math.min(18, Math.floor(state.map.width * 0.12))),
      navigationProfileId: index % 2 === 0 ? 'normal' : 'cautious',
    } satisfies UnitData;
  });
}

function buildSnapshot(state: SimulationState): AiSchedulerBrowserPerformanceSnapshot {
  return {
    unitIds: state.units.map((unit) => unit.id),
    graphControlledUnitCount: state.units.filter((unit) => unit.aiControl === 'graph').length,
    simulationStep: state.simulationStep,
    simulationTimeSeconds: state.simulationTimeSeconds,
    diagnostics: getAiSchedulerPerformanceDiagnostics(),
  };
}

function clampCell(value: number, size: number): number {
  return Math.max(1, Math.min(Math.max(1, size - 2), Math.floor(value)));
}
