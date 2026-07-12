import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import { getSelectedUnit, type SimulationState } from '../simulation/SimulationState';
import { getMapObjectSpatialIndexDiagnostics } from '../spatial/MapObjectSpatialIndex';
import { getVisibilityProbeState } from '../ui/RuntimeUiState';
import { computeLineOfSight, type LineOfSightProbeResult } from './LineOfSight';

export interface VisibilityProbeDiagnostics {
  calculationCount: number;
  cacheHitCount: number;
  lastObjectCandidateCount: number;
  lastKey: string;
}

interface VisibilityProbeCache {
  key: string;
  result: LineOfSightProbeResult;
  diagnostics: VisibilityProbeDiagnostics;
}

const cacheByState = new WeakMap<SimulationState, VisibilityProbeCache>();
const diagnosticsByState = new WeakMap<SimulationState, VisibilityProbeDiagnostics>();

export function getVisibilityProbeResult(state: SimulationState): LineOfSightProbeResult | null {
  const probe = getVisibilityProbeState(state);
  const unit = getSelectedUnit(state);
  if (!probe.active || !probe.target || !unit) return null;

  const revisions = getMapRevisionSnapshot(state.map);
  const key = [
    unit.id,
    unit.position.x.toFixed(4),
    unit.position.y.toFixed(4),
    unit.behaviorRuntime.posture,
    probe.target.x.toFixed(4),
    probe.target.y.toFixed(4),
    revisions.height,
    revisions.forest,
    revisions.objects,
  ].join(':');

  const cached = cacheByState.get(state);
  if (cached?.key === key) {
    cached.diagnostics.cacheHitCount += 1;
    cached.diagnostics.lastKey = key;
    return cached.result;
  }

  const previousDiagnostics = diagnosticsByState.get(state);
  const result = computeLineOfSight(state.map, unit, probe.target);
  const spatialDiagnostics = getMapObjectSpatialIndexDiagnostics(state.map);
  const diagnostics: VisibilityProbeDiagnostics = previousDiagnostics ?? {
    calculationCount: 0,
    cacheHitCount: 0,
    lastObjectCandidateCount: 0,
    lastKey: '',
  };
  diagnostics.calculationCount += 1;
  diagnostics.lastObjectCandidateCount = spatialDiagnostics.lastCandidateCount;
  diagnostics.lastKey = key;
  diagnosticsByState.set(state, diagnostics);
  cacheByState.set(state, { key, result, diagnostics });
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
