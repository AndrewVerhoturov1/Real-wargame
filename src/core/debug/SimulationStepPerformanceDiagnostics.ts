const MAX_SLOWEST_SIMULATION_STEPS = 80;

export interface SimulationStepPhaseDurations {
  metricsMs: number;
  perceptionMs: number;
  threatMemoryMs: number;
  aiSchedulerMs: number;
  combatMs: number;
  movementEventsMs: number;
  collisionsMs: number;
}

export interface SimulationStepPerformanceDiagnostic {
  readonly simulationStep: number;
  readonly simulationTimeSeconds: number;
  readonly performanceStartMs: number;
  readonly performanceEndMs: number;
  readonly totalDurationMs: number;
  readonly phases: SimulationStepPhaseDurations;
  readonly aiSchedulerDurationMs: number;
  readonly perceptionDurationMs: number;
  readonly movementEventsDurationMs: number;
  /** Navigation/replan work executes inside the movement-events phase. */
  readonly routeNavigationDurationMs: number;
  readonly tacticalFieldBuilds: number;
  readonly pointLosCacheMisses: number;
  readonly pointLosCacheHits: number;
  readonly unitId: string | null;
  readonly activeGraphNode: string | null;
  readonly maxUnitPassDurationMs: number;
  readonly uncoveredResidualDurationMs: number;
}

const slowestSteps: SimulationStepPerformanceDiagnostic[] = [];

export function recordSimulationStepPerformance(
  value: SimulationStepPerformanceDiagnostic,
): void {
  if (
    slowestSteps.length >= MAX_SLOWEST_SIMULATION_STEPS
    && value.totalDurationMs <= (slowestSteps[slowestSteps.length - 1]?.totalDurationMs ?? 0)
  ) return;
  const snapshot = clone(value);
  let index = slowestSteps.length;
  while (index > 0 && slowestSteps[index - 1].totalDurationMs < snapshot.totalDurationMs) index -= 1;
  slowestSteps.splice(index, 0, snapshot);
  if (slowestSteps.length > MAX_SLOWEST_SIMULATION_STEPS) slowestSteps.length = MAX_SLOWEST_SIMULATION_STEPS;
}

export function getSimulationStepPerformanceDiagnostics(): readonly SimulationStepPerformanceDiagnostic[] {
  return slowestSteps.map(clone);
}

export function resetSimulationStepPerformanceDiagnosticsForTests(): void {
  slowestSteps.length = 0;
}

export function roundSimulationDuration(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function clone(value: SimulationStepPerformanceDiagnostic): SimulationStepPerformanceDiagnostic {
  return { ...value, phases: { ...value.phases } };
}
