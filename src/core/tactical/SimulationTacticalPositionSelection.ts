import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import type { TacticalPositionCandidateSeed } from '../ai/tactical/TacticalQuery';
import type { SimulationState } from '../simulation/SimulationState';
import {
  createDefaultTacticalPositionSettings,
  getTacticalPositionSettings,
  getTacticalPositionSettingsRevision,
} from './TacticalPositionSettings';

const MAX_VISIBLE_TACTICAL_POSITIONS = 12;
const MIN_HIT_RADIUS_CELLS = 0.55;
const MAX_HIT_RADIUS_CELLS = 1.25;
const HIT_RADIUS_PIXELS = 12;

interface TacticalPositionSelectionRuntime {
  unitId: string | null;
  candidates: readonly TacticalPositionCandidateSeed[];
  selectedId: string | null;
  hoveredId: string | null;
  lastAcceptedAtSeconds: number;
  lastNonEmptyAtSeconds: number;
  settingsRevision: number;
}

export interface TacticalPositionPresentation {
  readonly unitId: string | null;
  readonly candidates: readonly TacticalPositionCandidateSeed[];
  readonly selected: TacticalPositionCandidateSeed | null;
  readonly hovered: TacticalPositionCandidateSeed | null;
}

const runtimeByState = new WeakMap<SimulationState, TacticalPositionSelectionRuntime>();

export function publishVisibleTacticalPositions(
  state: SimulationState,
  unitId: string,
  candidates: readonly TacticalPositionCandidateSeed[],
): void {
  const runtime = getRuntime(state);
  const ownerChanged = runtime.unitId !== unitId;
  const nowSeconds = finiteTime(state.simulationTimeSeconds);
  const unit = state.units?.find((candidate) => candidate.id === unitId);
  const settings = unit ? getTacticalPositionSettings(unit) : createDefaultTacticalPositionSettings();
  const settingsRevision = unit ? getTacticalPositionSettingsRevision(unit) : 0;
  const settingsChanged = runtime.settingsRevision !== settingsRevision;
  const bounded = candidates.length <= MAX_VISIBLE_TACTICAL_POSITIONS
    ? candidates
    : candidates.slice(0, MAX_VISIBLE_TACTICAL_POSITIONS);

  if (!ownerChanged && !settingsChanged && runtime.candidates.length > 0) {
    if (bounded.length === 0) {
      if (nowSeconds - runtime.lastNonEmptyAtSeconds < settings.emptyResultHoldSeconds) return;
    } else if (nowSeconds - runtime.lastAcceptedAtSeconds < settings.markerRefreshIntervalSeconds) {
      return;
    }
  }

  runtime.unitId = unitId;
  runtime.candidates = bounded;
  runtime.lastAcceptedAtSeconds = nowSeconds;
  runtime.settingsRevision = settingsRevision;
  if (bounded.length > 0) runtime.lastNonEmptyAtSeconds = nowSeconds;

  if (ownerChanged) {
    runtime.selectedId = null;
    runtime.hoveredId = null;
    return;
  }
  if (!containsCandidate(runtime, runtime.selectedId)) runtime.selectedId = null;
  if (!containsCandidate(runtime, runtime.hoveredId)) runtime.hoveredId = null;
}

export function clearVisibleTacticalPositions(state: SimulationState): void {
  const runtime = getRuntime(state);
  runtime.unitId = null;
  runtime.candidates = [];
  runtime.selectedId = null;
  runtime.hoveredId = null;
  runtime.lastAcceptedAtSeconds = 0;
  runtime.lastNonEmptyAtSeconds = 0;
  runtime.settingsRevision = 0;
}

export function findVisibleTacticalPositionAt(
  state: SimulationState,
  position: GridPosition,
): TacticalPositionCandidateSeed | null {
  const runtime = getRuntime(state);
  const radius = tacticalPositionHitRadiusCells(state);
  const radiusSquared = radius * radius;
  let nearest: TacticalPositionCandidateSeed | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of runtime.candidates) {
    const dx = candidate.position.x - position.x;
    const dy = candidate.position.y - position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > radiusSquared || distanceSquared >= nearestDistanceSquared) continue;
    nearest = candidate;
    nearestDistanceSquared = distanceSquared;
  }
  return nearest;
}

export function selectVisibleTacticalPositionAt(
  state: SimulationState,
  position: GridPosition,
): TacticalPositionCandidateSeed | null {
  const candidate = findVisibleTacticalPositionAt(state, position);
  getRuntime(state).selectedId = candidate?.id ?? null;
  return candidate;
}

export function selectVisibleTacticalPositionById(
  state: SimulationState,
  candidateId: string,
): TacticalPositionCandidateSeed | null {
  const runtime = getRuntime(state);
  const candidate = runtime.candidates.find((item) => item.id === candidateId) ?? null;
  runtime.selectedId = candidate?.id ?? null;
  return candidate;
}

export function getVisibleTacticalPositionById(
  state: SimulationState,
  candidateId: string,
): TacticalPositionCandidateSeed | null {
  return getRuntime(state).candidates.find((item) => item.id === candidateId) ?? null;
}

export function syncHoveredTacticalPosition(state: SimulationState): TacticalPositionCandidateSeed | null {
  const runtime = getRuntime(state);
  const candidate = state.mouseGridPosition
    ? findVisibleTacticalPositionAt(state, state.mouseGridPosition)
    : null;
  runtime.hoveredId = candidate?.id ?? null;
  return candidate;
}

export function getTacticalPositionPresentation(state: SimulationState): TacticalPositionPresentation {
  const runtime = getRuntime(state);
  return {
    unitId: runtime.unitId,
    candidates: runtime.candidates,
    selected: candidateById(runtime, runtime.selectedId),
    hovered: candidateById(runtime, runtime.hoveredId),
  };
}

export function recommendedPostureOf(candidate: TacticalPositionCandidateSeed): UnitPosture {
  const posture = candidate.metrics.recommendedPosture;
  return posture === 'crouched' || posture === 'prone' ? posture : 'standing';
}

export function tacticalPositionHitRadiusCells(state: SimulationState): number {
  const cellSize = Math.max(1, state.map.cellSize);
  return Math.min(
    MAX_HIT_RADIUS_CELLS,
    Math.max(MIN_HIT_RADIUS_CELLS, HIT_RADIUS_PIXELS / cellSize),
  );
}

function getRuntime(state: SimulationState): TacticalPositionSelectionRuntime {
  let runtime = runtimeByState.get(state);
  if (!runtime) {
    runtime = {
      unitId: null,
      candidates: [],
      selectedId: null,
      hoveredId: null,
      lastAcceptedAtSeconds: 0,
      lastNonEmptyAtSeconds: 0,
      settingsRevision: 0,
    };
    runtimeByState.set(state, runtime);
  }
  return runtime;
}

function candidateById(
  runtime: TacticalPositionSelectionRuntime,
  candidateId: string | null,
): TacticalPositionCandidateSeed | null {
  if (!candidateId) return null;
  return runtime.candidates.find((candidate) => candidate.id === candidateId) ?? null;
}

function containsCandidate(runtime: TacticalPositionSelectionRuntime, candidateId: string | null): boolean {
  return candidateId !== null && runtime.candidates.some((candidate) => candidate.id === candidateId);
}

function finiteTime(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}
