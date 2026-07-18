import {
  normalizeSignedDegrees,
  radiansToDegrees,
  resolveAttentionSample,
  type AttentionZone,
} from '../perception/AttentionModel';
import { resolveVegetationDefinition } from '../map/VegetationDefinition';
import { getSelectedUnit, type SimulationState } from '../simulation/SimulationState';
import { getAttentionOverlayState } from '../ui/RuntimeUiState';
import type { UnitModel } from '../units/UnitModel';
import { evaluateCellVisibilityQuality, observerVisibilityCondition } from './VisibilityQuality';
import {
  getVisibilityGeometryField,
  getVisibilityGeometryFieldDiagnostics,
} from './VisibilityGeometryField';

const MOVING_REBUILD_INTERVAL_SECONDS = 0.2;
const POSITION_QUANTUM_CELLS = 0.25;
const TARGET_EYE_HEIGHT_METERS = 1.4;
const MIN_VISUAL_TRANSMISSION = resolveVegetationDefinition('none').visibility.minimumTransmission;

export const VISIBILITY_ZONE_CODE = {
  unseen: 0,
  focus: 1,
  direct: 2,
  peripheral: 3,
  rear: 4,
  near: 5,
} as const;

export type VisibilityZoneCode = typeof VISIBILITY_ZONE_CODE[keyof typeof VISIBILITY_ZONE_CODE];

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
  revision: number;
  calculationKey: string;
  mapVisualRevision: number;
  builtAtSeconds: number;
}

export interface VisibilityFieldDiagnostics {
  rebuildCount: number;
  cacheHitCount: number;
  processedCellCount: number;
  rayCount: number;
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

  const radiusCells = Math.max(
    1,
    Math.ceil(unit.attentionSettings.vision.maximumVisualRangeMeters / state.map.metersPerCell),
  );
  const geometry = getVisibilityGeometryField(state.map, {
    origin: unit.position,
    originHeightAboveGroundMeters: eyeHeightForPosture(unit.behaviorRuntime.posture),
    targetHeightAboveGroundMeters: TARGET_EYE_HEIGHT_METERS,
    rangeCells: radiusCells,
    channel: 'visual',
  });
  const key = buildCalculationKey(state, unit, geometry.key);
  if (current?.calculationKey === key) {
    runtime.diagnostics.cacheHitCount += 1;
    return current;
  }

  const reason = current === null
    ? 'initial'
    : current.mapVisualRevision !== geometry.mapVisualRevision
      ? 'map-visual-revision'
      : moved
        ? 'observer-moved'
        : 'observer-state';
  const started = nowMilliseconds();
  const field = buildVisibilityField(
    state,
    unit,
    geometry,
    key,
    runtime.diagnostics.fieldRevision + 1,
  );
  runtime.fieldsByUnit.set(unit.id, field);
  runtime.lastObserverPositionByUnit.set(unit.id, { ...unit.position });
  trimUnitFields(runtime, state);
  runtime.diagnostics.rebuildCount += 1;
  runtime.diagnostics.lastBuildReason = reason;
  runtime.diagnostics.lastBuildDurationMs = Math.max(0, nowMilliseconds() - started);
  runtime.diagnostics.lastKey = key;
  runtime.diagnostics.fieldRevision = field.revision;
  runtime.diagnostics.processedCellCount = field.width * field.height;
  runtime.diagnostics.rayCount = getVisibilityGeometryFieldDiagnostics(state.map).rayCount;
  runtime.diagnostics.cachedFieldCount = runtime.fieldsByUnit.size;
  return field;
}

export function getVisibilityFieldDiagnostics(state: SimulationState): VisibilityFieldDiagnostics {
  const runtime = getRuntime(state);
  // Legacy v1 exposed `cachedFieldCount: runtime.field ? 1 : 0`; v2 reports every requested unit field.
  return { ...runtime.diagnostics, cachedFieldCount: runtime.fieldsByUnit.size };
}

export function invalidateSelectedUnitVisibilityField(state: SimulationState, reason = 'manual'): void {
  const runtime = getRuntime(state);
  runtime.fieldsByUnit.clear();
  runtime.lastObserverPositionByUnit.clear();
  runtime.diagnostics.lastBuildReason = reason;
  runtime.diagnostics.lastKey = '';
  runtime.diagnostics.cachedFieldCount = 0;
}

export function sampleSelectedUnitVisibilityField(
  field: SelectedUnitVisibilityField,
  cellX: number,
  cellY: number,
): number {
  const x = Math.floor(cellX) - field.minCellX;
  const y = Math.floor(cellY) - field.minCellY;
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return 0;
  return field.quality[y * field.width + x] ?? 0;
}

export function sampleSelectedUnitVisibilityZone(
  field: SelectedUnitVisibilityField,
  cellX: number,
  cellY: number,
): VisibilityZoneCode {
  const x = Math.floor(cellX) - field.minCellX;
  const y = Math.floor(cellY) - field.minCellY;
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return VISIBILITY_ZONE_CODE.unseen;
  return (field.zone[y * field.width + x] ?? VISIBILITY_ZONE_CODE.unseen) as VisibilityZoneCode;
}

function buildVisibilityField(
  state: SimulationState,
  unit: UnitModel,
  geometry: ReturnType<typeof getVisibilityGeometryField>,
  calculationKey: string,
  revision: number,
): SelectedUnitVisibilityField {
  const radiusCells = Math.max(
    1,
    Math.ceil(unit.attentionSettings.vision.maximumVisualRangeMeters / state.map.metersPerCell),
  );
  const originCellX = clamp(Math.floor(unit.position.x), 0, state.map.width - 1);
  const originCellY = clamp(Math.floor(unit.position.y), 0, state.map.height - 1);
  const minCellX = Math.max(0, originCellX - radiusCells);
  const minCellY = Math.max(0, originCellY - radiusCells);
  const maxCellX = Math.min(state.map.width - 1, originCellX + radiusCells);
  const maxCellY = Math.min(state.map.height - 1, originCellY + radiusCells);
  const width = maxCellX - minCellX + 1;
  const height = maxCellY - minCellY + 1;
  const quality = new Uint8Array(width * height);
  const zone = new Uint8Array(width * height);
  const blocker = new Uint8Array(width * height);
  const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  const observerCondition = observerVisibilityCondition({
    fatigue: unit.soldier.condition.fatigue,
    confusion: unit.soldier.condition.confusion,
    health: unit.soldier.condition.health,
    suppression: unit.behaviorRuntime.suppression,
  });

  for (let y = minCellY; y <= maxCellY; y += 1) {
    for (let x = minCellX; x <= maxCellX; x += 1) {
      const localIndex = (y - minCellY) * width + (x - minCellX);
      const mapIndex = y * state.map.width + x;
      // Deny by default: every cell remains unseen until all canonical checks explicitly allow it.
      let currentVisibilityQuality = 0;
      let currentZoneCode: VisibilityZoneCode = VISIBILITY_ZONE_CODE.unseen;
      const dx = x + 0.5 - unit.position.x;
      const dy = y + 0.5 - unit.position.y;
      const distanceCells = Math.hypot(dx, dy);
      const distanceMeters = distanceCells * state.map.metersPerCell;
      if (distanceMeters > unit.attentionSettings.vision.maximumVisualRangeMeters) {
        quality[localIndex] = currentVisibilityQuality;
        zone[localIndex] = currentZoneCode;
        continue;
      }

      const bearing = Math.atan2(dy, dx);
      const angleDifferenceDegrees = normalizeSignedDegrees(
        radiansToDegrees(bearing - unit.attentionRuntime.focusDirectionRadians),
      );
      const attention = resolveAttentionSample(
        profile,
        angleDifferenceDegrees,
        distanceMeters,
        unit.attentionSettings.nearAwarenessRangeMeters,
        unit.attentionSettings.nearMinimumVisibilityQuality,
      );
      if (attention.zone === 'outside' || attention.weight <= 0 || distanceMeters > attention.maximumRangeMeters) {
        quality[localIndex] = currentVisibilityQuality;
        zone[localIndex] = currentZoneCode;
        continue;
      }

      const visualTransmission = (geometry.visualTransmission[mapIndex] ?? 0) / 255;
      const hardBlocked = geometry.hardBlocked[mapIndex] === 1;
      const evaluated = evaluateCellVisibilityQuality({
        blocked: hardBlocked || visualTransmission <= MIN_VISUAL_TRANSMISSION,
        visualTransmission,
        distanceMeters,
        attentionWeight: attention.weight,
        observerCondition,
        vision: unit.attentionSettings.vision,
        minimumVisibilityQuality: attention.minimumVisibilityQuality,
      });
      if (!evaluated.blocked && evaluated.quality01 > 0) {
        currentVisibilityQuality = Math.round(evaluated.quality01 * 255);
        currentZoneCode = visibilityZoneCode(attention.zone);
      }
      quality[localIndex] = currentVisibilityQuality;
      zone[localIndex] = currentZoneCode;
      blocker[localIndex] = evaluated.blocked ? 1 : 0;
    }
  }

  return {
    observerId: unit.id,
    originCellX,
    originCellY,
    minCellX,
    minCellY,
    width,
    height,
    quality,
    zone,
    blocker,
    revision,
    calculationKey,
    mapVisualRevision: geometry.mapVisualRevision,
    builtAtSeconds: state.simulationTimeSeconds,
  };
}

function buildCalculationKey(
  state: SimulationState,
  unit: UnitModel,
  geometryKey: string,
): string {
  const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  return [
    'current-unit-view:v3-rear-attention',
    unit.id,
    geometryKey,
    quantize(unit.position.x, POSITION_QUANTUM_CELLS),
    quantize(unit.position.y, POSITION_QUANTUM_CELLS),
    unit.behaviorRuntime.posture,
    unit.attentionRuntime.mode,
    quantize(unit.attentionRuntime.focusDirectionRadians, 0.05),
    profile.focusAngleDegrees.toFixed(1),
    profile.directAngleDegrees.toFixed(1),
    profile.peripheralAngleDegrees.toFixed(1),
    profile.focusWeight.toFixed(3),
    profile.directWeight.toFixed(3),
    profile.peripheralWeight.toFixed(3),
    profile.rearWeight.toFixed(3),
    profile.rearMaximumRangeMeters.toFixed(1),
    unit.attentionSettings.nearAwarenessRangeMeters.toFixed(2),
    unit.attentionSettings.nearMinimumVisibilityQuality.toFixed(3),
    unit.attentionSettings.vision.maximumVisualRangeMeters.toFixed(1),
    unit.attentionSettings.vision.distanceFalloffStartMeters.toFixed(1),
    unit.attentionSettings.vision.distanceFalloffExponent.toFixed(2),
    quantize(unit.soldier.condition.fatigue, 1),
    quantize(unit.soldier.condition.confusion, 1),
    quantize(unit.soldier.condition.health, 1),
    quantize(unit.behaviorRuntime.suppression, 1),
    state.map.metersPerCell.toFixed(3),
  ].join(':');
}

function visibilityZoneCode(zone: AttentionZone): VisibilityZoneCode {
  if (zone === 'focus') return VISIBILITY_ZONE_CODE.focus;
  if (zone === 'direct') return VISIBILITY_ZONE_CODE.direct;
  if (zone === 'peripheral') return VISIBILITY_ZONE_CODE.peripheral;
  if (zone === 'rear') return VISIBILITY_ZONE_CODE.rear;
  if (zone === 'near') return VISIBILITY_ZONE_CODE.near;
  return VISIBILITY_ZONE_CODE.unseen;
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

function eyeHeightForPosture(posture: UnitModel['behaviorRuntime']['posture']): number {
  if (posture === 'prone') return 0.35;
  if (posture === 'crouched') return 1.1;
  return 1.7;
}

function quantize(value: number, step: number): string {
  return (Math.round(value / step) * step).toFixed(3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nowMilliseconds(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
