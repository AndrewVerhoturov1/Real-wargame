import { getEnvironmentProfileDomainKey } from '../map/EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from '../map/EnvironmentProfileRuntime';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import { getSelectedUnit, type SimulationState } from '../simulation/SimulationState';
import { getVisibilityProbeState } from '../ui/RuntimeUiState';
import { computeLineOfSight, type LineOfSightProbeResult } from './LineOfSight';

export interface VisibilityProbeDiagnostics {
  calculationCount: number;
  cacheHitCount: number;
  /** Retained compatibility field; canonical raster geometry no longer queries the point spatial index. */
  lastObjectCandidateCount: number;
  lastKey: string;
}

interface VisibilityProbeCache {
  key: string;
  result: LineOfSightProbeResult;
  diagnostics: VisibilityProbeDiagnostics;
}

type VisibilityProbeDebugWindow = Window & {
  __realWargameVisibilityProbeDebug?: VisibilityProbeDiagnostics;
};

const cacheByState = new WeakMap<SimulationState, VisibilityProbeCache>();
const diagnosticsByState = new WeakMap<SimulationState, VisibilityProbeDiagnostics>();

export function getVisibilityProbeResult(state: SimulationState): LineOfSightProbeResult | null {
  const probe = getVisibilityProbeState(state);
  const unit = getSelectedUnit(state);
  if (!probe.active || !probe.target || !unit) return null;

  const revisions = getMapRevisionSnapshot(state.map);
  const key = [
    'visibility-probe:v2-kernel',
    unit.id,
    exactCoordinateKey(unit.position.x),
    exactCoordinateKey(unit.position.y),
    unit.behaviorRuntime.posture,
    exactCoordinateKey(probe.target.x),
    exactCoordinateKey(probe.target.y),
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
    getEnvironmentProfileDomainKey(getActiveEnvironmentProfile(), 'visibility'),
  ].join(':');

  const cached = cacheByState.get(state);
  if (cached?.key === key) {
    cached.diagnostics.cacheHitCount += 1;
    cached.diagnostics.lastKey = key;
    publishDiagnostics(cached.diagnostics);
    return cached.result;
  }

  const previousDiagnostics = diagnosticsByState.get(state);
  const result = computeLineOfSight(state.map, unit, probe.target);
  const diagnostics: VisibilityProbeDiagnostics = previousDiagnostics ?? {
    calculationCount: 0,
    cacheHitCount: 0,
    lastObjectCandidateCount: 0,
    lastKey: '',
  };
  diagnostics.calculationCount += 1;
  diagnostics.lastObjectCandidateCount = 0;
  diagnostics.lastKey = key;
  diagnosticsByState.set(state, diagnostics);
  cacheByState.set(state, { key, result, diagnostics });
  publishDiagnostics(diagnostics);
  return result;
}

export function getVisibilityProbeDiagnostics(state: SimulationState): VisibilityProbeDiagnostics {
  const diagnostics = diagnosticsByState.get(state);
  if (!diagnostics) {
    return {
      calculationCount: 0,
      cacheHitCount: 0,
      lastObjectCandidateCount: 0,
      lastKey: '',
    };
  }
  return { ...diagnostics };
}

export function clearVisibilityProbeCache(state: SimulationState): void {
  cacheByState.delete(state);
}

function exactCoordinateKey(value: number): string {
  return Number.isFinite(value) ? Number(value).toPrecision(15) : 'invalid';
}

function publishDiagnostics(diagnostics: VisibilityProbeDiagnostics): void {
  if (typeof window === 'undefined') return;
  (window as VisibilityProbeDebugWindow).__realWargameVisibilityProbeDebug = { ...diagnostics };
}
