import type { SimulationState } from '../simulation/SimulationState';

export interface PerceptionDiagnostics {
  tickCount: number;
  candidateCount: number;
  losCalculationCount: number;
  skippedNotDueCount: number;
  contactUpdateCount: number;
  bestContactId: string | null;
  lastObserverId: string | null;
}

type PerceptionDebugWindow = Window & {
  __realWargamePerceptionDebug?: PerceptionDiagnostics;
};

const diagnosticsByState = new WeakMap<SimulationState, PerceptionDiagnostics>();

export function getMutablePerceptionDiagnostics(state: SimulationState): PerceptionDiagnostics {
  let diagnostics = diagnosticsByState.get(state);
  if (!diagnostics) {
    diagnostics = {
      tickCount: 0,
      candidateCount: 0,
      losCalculationCount: 0,
      skippedNotDueCount: 0,
      contactUpdateCount: 0,
      bestContactId: null,
      lastObserverId: null,
    };
    diagnosticsByState.set(state, diagnostics);
  }
  return diagnostics;
}

export function getPerceptionDiagnostics(state: SimulationState): PerceptionDiagnostics {
  return { ...getMutablePerceptionDiagnostics(state) };
}

export function publishPerceptionDiagnostics(state: SimulationState): void {
  if (typeof window === 'undefined') return;
  (window as PerceptionDebugWindow).__realWargamePerceptionDebug = getPerceptionDiagnostics(state);
}
