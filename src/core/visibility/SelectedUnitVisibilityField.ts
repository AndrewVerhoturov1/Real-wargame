import { resolveVegetationDefinition } from '../map/VegetationDefinition';
import { getSelectedUnit, type SimulationState } from '../simulation/SimulationState';
import { getAttentionOverlayState, type HeatmapTargetPosture } from '../ui/RuntimeUiState';
import type { UnitModel } from '../units/UnitModel';
import { evaluateCellVisibilityQuality, observerVisibilityCondition } from './VisibilityQuality';
import {
  buildVisibilityCandidateMask,
  VISIBILITY_ZONE_CODE,
  type VisibilityCandidateMask,
  type VisibilityZoneCode,
} from './VisibilityCandidateMask';
import { getVisibilityGeometryField } from './VisibilityGeometryField';
import { soldierPostureHeightMeters } from './VisibilityPosture';

const MOVING_REBUILD_INTERVAL_SECONDS = 0.2;
const MIN_VISUAL_TRANSMISSION = resolveVegetationDefinition('none').visibility.minimumTransmission;

export { VISIBILITY_ZONE_CODE } from './VisibilityCandidateMask';
export type { VisibilityZoneCode } from './VisibilityCandidateMask';

export interface SelectedUnitVisibilityField {
  observerId: string;
  originCellX: number;
  originCellY: number;
  minCellX: number;
  minCellY: number;
  width: number;
  height: number;
  quality: Uint8Array;
  zone: Uint8Array;
  blocker: Uint8Array;
  evaluated: Uint8Array;
  revision: number;
  calculationKey: string;
  mapVisualRevision: number;
  builtAtSeconds: number;
  candidateCellCount: number;
  evaluatedTargetCellCount: number;
  skippedOutsideAttentionCellCount: number;
  geometryTraversedCellCount: number;
  geometryRayCount: number;
  heatmapTargetPosture: HeatmapTargetPosture;
}

export interface VisibilityFieldDiagnostics {
  rebuildCount: number;
  cacheHitCount: number;
  processedCellCount: number;
  rayCount: number;
  candidateCellCount: number;
  evaluatedTargetCellCount: number;
  skippedOutsideAttentionCellCount: number;
  geometryTraversedCellCount: number;
  geometryRayCount: number;
  lastBuildReason: string;
  lastBuildDurationMs: number;
  lastKey: string;
  fieldRevision: number;
  cachedFieldCount: number;
}

interface VisibilityFieldRuntime {
  readonly fieldsByUnit: Map<string, SelectedUnitVisibilityField>;
  readonly lastObserverPositionByUnit: Map<string, { x: number; y: number }>;
  diagnostics: VisibilityFieldDiagnostics;
}

const runtimeByState = new WeakMap<SimulationState, VisibilityFieldRuntime>();

/** UI-facing facade. Hidden overlays still perform zero work. */
export function getSelectedUnitVisibilityField(state: SimulationState): SelectedUnitVisibilityField | null {
  const overlay = getAttentionOverlayState(state);
  const unit = getSelectedUnit(state);
  if (!overlay.active || !overlay.showCurrentView || !unit || state.editor.enabled) return null;
  return getUnitVisibilityField(state, unit);
}

/** Renderer-independent current-view field for any requested unit. */
export function getUnitVisibilityField(
  state: SimulationState,
  unit: UnitModel,
): SelectedUnitVisibilityField {
  const runtime = getRuntime(state);
  const current = runtime.fieldsByUnit.get(unit.id) ?? null;
  const lastPosition = runtime.lastObserverPositionByUnit.get(unit.id) ?? null;
  const moved = lastPosition !== null
    && (Math.abs(lastPosition.x - unit.position.x) > 0.001
      || Math.abs(lastPosition.y - unit.position.y) > 0.001);

  if (moved && current && state.simulationTimeSeconds - current.builtAtSeconds < MOVING_REBUILD_INTERVAL_SECONDS) {
    runtime.diagnostics.cacheHitCount += 1;
    return current;
  }

  const overlay = getAttentionOverlayState(state);
  const mask = buildVisibilityCandidateMask(state, unit);
  const radiusCells = Math.max(
    1,
    Math.ceil(unit.attentionSettings.vision.maximumVisualRangeMeters / Math.max(0.001, state.map.metersPerCell)),
  );
  const geometry = getVisibilityGeometryField(state.map, {
    origin: unit.position,
    originHeightAboveGroundMeters: soldierPostureHeightMeters(unit.behaviorRuntime.posture),
    targetHeightAboveGroundMeters: heatmapTargetHeightMeters(overlay.heatmapTargetPosture),
    rangeCells: radiusCells,
    channel: 'visual',
    candidateMask: mask,
  });
  const key = buildCalculationKey(state, unit, mask, geometry.key, overlay.heatmapTargetPosture);
  if (current?.calculationKey === key) {
    runtime.diagnostics.cacheHitCount += 1;
    return current;
  }

  const reason = current === null
    ? 'initial'
    : current.mapVisualRevision !== geometry.mapVisualRevision
      ? 'map-visual-revision'
      : current.heatmapTargetPosture !== overlay.heatmapTargetPosture
        ? 'target-posture-preview'
        : moved
          ? 'observer-moved'
          : 'observer-state';
  const started = nowMilliseconds();
  const field = buildVisibilityField(
    state,
    unit,
    mask,
    geometry,
    key,
    runtime.diagnostics.fieldRevision + 1,
    overlay.heatmapTargetPosture,
  );
  runtime.fieldsByUnit.set(unit.id, field);
  runtime.lastObserverPositionByUnit.set(unit.id, { ...unit.position });
  trimUnitFields(runtime, state);
  runtime.diagnostics.rebuildCount += 1;
  runtime.diagnostics.lastBuildReason = reason;
  runtime.diagnostics.lastBuildDurationMs = Math.max(0, nowMilliseconds() - started);
  runtime.diagnostics.lastKey = key;
  runtime.diagnostics.fieldRevision = field.revision;
  runtime.diagnostics.processedCellCount = field.evaluatedTargetCellCount;
  runtime.diagnostics.rayCount = field.geometryRayCount;
  runtime.diagnostics.candidateCellCount = field.candidateCellCount;
  runtime.diagnostics.evaluatedTargetCellCount = field.evaluatedTargetCellCount;
  runtime.diagnostics.skippedOutsideAttentionCellCount = field.skippedOutsideAttentionCellCount;
  runtime.diagnostics.geometryTraversedCellCount = field.geometryTraversedCellCount;
  runtime.diagnostics.geometryRayCount = field.geometryRayCount;
  runtime.diagnostics.cachedFieldCount = runtime.fieldsByUnit.size;
  return field;
}

export function getVisibilityFieldDiagnostics(state: SimulationState): VisibilityFieldDiagnostics {
  const runtime = getRuntime(state);
  return { ...runtime.diagnostics, cachedFieldCount: runtime.fieldsByUnit.size };
}

export function invalidateSelectedUnitVisibilityField(state: SimulationState, reason = 'manual'): void {
  const runtime = getRuntime(state);
  runtime.fieldsByUnit.clear();
  runtime.lastObserverPositionByUnit.clear();
  runtime.diagnostics.lastBuildReason = reason;
  runtime.diagnostics.lastKey = '';
  runtime.diagnostics.cachedFieldCount = 0;
  runtime.diagnostics.candidateCellCount = 0;
  runtime.diagnostics.evaluatedTargetCellCount = 0;
  runtime.diagnostics.skippedOutsideAttentionCellCount = 0;
  runtime.diagnostics.geometryTraversedCellCount = 0;
  runtime.diagnostics.geometryRayCount = 0;
}

export function sampleSelectedUnitVisibilityField(
  field: SelectedUnitVisibilityField,
  cellX: number,
  cellY: number,
): number {
  const index = localFieldIndex(field, cellX, cellY);
  return index < 0 ? 0 : field.quality[index] ?? 0;
}

export function sampleSelectedUnitVisibilityZone(
  field: SelectedUnitVisibilityField,
  cellX: number,
  cellY: number,
): VisibilityZoneCode {
  const index = localFieldIndex(field, cellX, cellY);
  if (index < 0) return VISIBILITY_ZONE_CODE.unseen;
  return (field.zone[index] ?? VISIBILITY_ZONE_CODE.unseen) as VisibilityZoneCode;
}

export function heatmapTargetHeightMeters(posture: HeatmapTargetPosture): number {
  return soldierPostureHeightMeters(posture);
}

function buildVisibilityField(
  state: SimulationState,
  unit: UnitModel,
  mask: VisibilityCandidateMask,
  geometry: ReturnType<typeof getVisibilityGeometryField>,
  calculationKey: string,
  revision: number,
  heatmapTargetPosture: HeatmapTargetPosture,
): SelectedUnitVisibilityField {
  const quality = new Uint8Array(mask.width * mask.height);
  const zone = new Uint8Array(mask.zone);
  const blocker = new Uint8Array(mask.width * mask.height);
  const evaluated = new Uint8Array(mask.width * mask.height);
  const observerCondition = observerVisibilityCondition({
    fatigue: unit.soldier.condition.fatigue,
    confusion: unit.soldier.condition.confusion,
    health: unit.soldier.condition.health,
    suppression: unit.behaviorRuntime.suppression,
  });

  for (let localIndex = 0; localIndex < mask.candidate.length; localIndex += 1) {
    if (mask.candidate[localIndex] !== 1) continue;
    const localX = localIndex % mask.width;
    const localY = Math.floor(localIndex / mask.width);
    const mapX = mask.minCellX + localX;
    const mapY = mask.minCellY + localY;
    const mapIndex = mapY * state.map.width + mapX;
    if (geometry.evaluated[mapIndex] !== 1) continue;
    evaluated[localIndex] = 1;
    const visualTransmission = (geometry.visualTransmission[mapIndex] ?? 0) / 255;
    const hardBlocked = geometry.hardBlocked[mapIndex] === 1;
    const zoneCode = (mask.zone[localIndex] ?? VISIBILITY_ZONE_CODE.unseen) as VisibilityZoneCode;
    const evaluatedQuality = evaluateCellVisibilityQuality({
      blocked: hardBlocked || visualTransmission <= MIN_VISUAL_TRANSMISSION,
      visualTransmission,
      distanceMeters: mask.distanceMeters[localIndex] ?? 0,
      attentionWeight: (mask.attentionWeight[localIndex] ?? 0) / 255,
      observerCondition,
      vision: unit.attentionSettings.vision,
      minimumVisibilityQuality: zoneCode === VISIBILITY_ZONE_CODE.near
        ? unit.attentionSettings.nearMinimumVisibilityQuality
        : 0,
    });
    if (!evaluatedQuality.blocked && evaluatedQuality.quality01 > 0) {
      quality[localIndex] = Math.round(evaluatedQuality.quality01 * 255);
    } else {
      zone[localIndex] = VISIBILITY_ZONE_CODE.unseen;
    }
    blocker[localIndex] = evaluatedQuality.blocked ? geometry.blockerKind[mapIndex] || 1 : 0;
  }

  return {
    observerId: unit.id,
    originCellX: Math.floor(unit.position.x),
    originCellY: Math.floor(unit.position.y),
    minCellX: mask.minCellX,
    minCellY: mask.minCellY,
    width: mask.width,
    height: mask.height,
    quality,
    zone,
    blocker,
    evaluated,
    revision,
    calculationKey,
    mapVisualRevision: geometry.mapVisualRevision,
    builtAtSeconds: state.simulationTimeSeconds,
    candidateCellCount: mask.candidateCellCount,
    evaluatedTargetCellCount: geometry.evaluatedTargetCellCount,
    skippedOutsideAttentionCellCount: mask.skippedOutsideAttentionCellCount,
    geometryTraversedCellCount: geometry.geometryTraversedCellCount,
    geometryRayCount: geometry.geometryRayCount,
    heatmapTargetPosture,
  };
}

function buildCalculationKey(
  state: SimulationState,
  unit: UnitModel,
  mask: VisibilityCandidateMask,
  geometryKey: string,
  heatmapTargetPosture: HeatmapTargetPosture,
): string {
  return [
    'current-unit-view:v4-unified-kernel',
    unit.id,
    mask.key,
    geometryKey,
    unit.behaviorRuntime.posture,
    heatmapTargetPosture,
    exact(unit.soldier.condition.fatigue),
    exact(unit.soldier.condition.confusion),
    exact(unit.soldier.condition.health),
    exact(unit.behaviorRuntime.suppression),
    state.map.metersPerCell,
  ].join(':');
}

function getRuntime(state: SimulationState): VisibilityFieldRuntime {
  let runtime = runtimeByState.get(state);
  if (!runtime) {
    runtime = {
      fieldsByUnit: new Map(),
      lastObserverPositionByUnit: new Map(),
      diagnostics: {
        rebuildCount: 0,
        cacheHitCount: 0,
        processedCellCount: 0,
        rayCount: 0,
        candidateCellCount: 0,
        evaluatedTargetCellCount: 0,
        skippedOutsideAttentionCellCount: 0,
        geometryTraversedCellCount: 0,
        geometryRayCount: 0,
        lastBuildReason: 'none',
        lastBuildDurationMs: 0,
        lastKey: '',
        fieldRevision: 0,
        cachedFieldCount: 0,
      },
    };
    runtimeByState.set(state, runtime);
  }
  return runtime;
}

function trimUnitFields(runtime: VisibilityFieldRuntime, state: SimulationState): void {
  const validIds = new Set(state.units.map((unit) => unit.id));
  for (const unitId of runtime.fieldsByUnit.keys()) {
    if (validIds.has(unitId)) continue;
    runtime.fieldsByUnit.delete(unitId);
    runtime.lastObserverPositionByUnit.delete(unitId);
  }
}

function localFieldIndex(
  field: Pick<SelectedUnitVisibilityField, 'minCellX' | 'minCellY' | 'width' | 'height'>,
  cellX: number,
  cellY: number,
): number {
  const x = Math.floor(cellX) - field.minCellX;
  const y = Math.floor(cellY) - field.minCellY;
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return -1;
  return y * field.width + x;
}

function exact(value: number): string {
  return Number.isFinite(value) ? Number(value).toPrecision(15) : 'invalid';
}

function nowMilliseconds(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
