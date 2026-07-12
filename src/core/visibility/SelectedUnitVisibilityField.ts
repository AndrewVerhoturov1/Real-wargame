import {
  normalizeSignedDegrees,
  radiansToDegrees,
  sampleAttentionWeight,
} from '../perception/AttentionModel';
import { getSelectedUnit, type SimulationState } from '../simulation/SimulationState';
import { getAttentionOverlayState } from '../ui/RuntimeUiState';
import type { UnitModel } from '../units/UnitModel';
import { evaluateCellVisibilityQuality, observerVisibilityCondition } from './VisibilityQuality';
import { getVisibilityStaticGrid, type VisibilityStaticGrid } from './VisibilityStaticGrid';

const FOREST_MIN_TRANSMISSION = 0.04;
const SPARSE_FOREST_LOSS_PER_METER = 0.035;
const DENSE_FOREST_LOSS_PER_METER = 0.075;
const MOVING_REBUILD_INTERVAL_SECONDS = 0.2;
const POSITION_QUANTUM_CELLS = 0.25;
const TARGET_EYE_HEIGHT_METERS = 1.4;
const HORIZON_MARGIN = 0.02;

export interface SelectedUnitVisibilityField {
  observerId: string;
  originCellX: number;
  originCellY: number;
  minCellX: number;
  minCellY: number;
  width: number;
  height: number;
  quality: Uint8Array;
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
  field: SelectedUnitVisibilityField | null;
  diagnostics: VisibilityFieldDiagnostics;
  lastObserverPosition: { x: number; y: number } | null;
}

const runtimeByState = new WeakMap<SimulationState, VisibilityFieldRuntime>();

export function getSelectedUnitVisibilityField(state: SimulationState): SelectedUnitVisibilityField | null {
  const overlay = getAttentionOverlayState(state);
  const unit = getSelectedUnit(state);
  const runtime = getRuntime(state);
  if (!overlay.active || !overlay.showCurrentView || !unit || state.editor.enabled) return null;

  const staticGrid = getVisibilityStaticGrid(state.map);
  const key = buildCalculationKey(state, unit, staticGrid.mapVisualRevision);
  if (runtime.field?.calculationKey === key) {
    runtime.diagnostics.cacheHitCount += 1;
    return runtime.field;
  }

  const moved = runtime.lastObserverPosition !== null
    && (Math.abs(runtime.lastObserverPosition.x - unit.position.x) > 0.001
      || Math.abs(runtime.lastObserverPosition.y - unit.position.y) > 0.001);
  if (moved && runtime.field && state.simulationTimeSeconds - runtime.field.builtAtSeconds < MOVING_REBUILD_INTERVAL_SECONDS) {
    runtime.diagnostics.cacheHitCount += 1;
    return runtime.field;
  }

  const reason = runtime.field === null
    ? 'initial'
    : runtime.field.mapVisualRevision !== staticGrid.mapVisualRevision
      ? 'map-visual-revision'
      : moved
        ? 'observer-moved'
        : 'observer-state';
  const started = nowMilliseconds();
  const field = buildVisibilityField(state, unit, staticGrid, key, runtime.diagnostics.fieldRevision + 1);
  runtime.field = field;
  runtime.lastObserverPosition = { ...unit.position };
  runtime.diagnostics.rebuildCount += 1;
  runtime.diagnostics.lastBuildReason = reason;
  runtime.diagnostics.lastBuildDurationMs = Math.max(0, nowMilliseconds() - started);
  runtime.diagnostics.lastKey = key;
  runtime.diagnostics.fieldRevision = field.revision;
  return field;
}

export function getVisibilityFieldDiagnostics(state: SimulationState): VisibilityFieldDiagnostics {
  const runtime = getRuntime(state);
  return { ...runtime.diagnostics, cachedFieldCount: runtime.field ? 1 : 0 };
}

export function invalidateSelectedUnitVisibilityField(state: SimulationState, reason = 'manual'): void {
  const runtime = getRuntime(state);
  runtime.field = null;
  runtime.lastObserverPosition = null;
  runtime.diagnostics.lastBuildReason = reason;
  runtime.diagnostics.lastKey = '';
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

function buildVisibilityField(
  state: SimulationState,
  unit: UnitModel,
  staticGrid: VisibilityStaticGrid,
  calculationKey: string,
  revision: number,
): SelectedUnitVisibilityField {
  const radiusCells = Math.max(1, Math.ceil(unit.attentionSettings.vision.maximumVisualRangeMeters / state.map.metersPerCell));
  const originCellX = clamp(Math.floor(unit.position.x), 0, state.map.width - 1);
  const originCellY = clamp(Math.floor(unit.position.y), 0, state.map.height - 1);
  const minCellX = Math.max(0, originCellX - radiusCells);
  const minCellY = Math.max(0, originCellY - radiusCells);
  const maxCellX = Math.min(state.map.width - 1, originCellX + radiusCells);
  const maxCellY = Math.min(state.map.height - 1, originCellY + radiusCells);
  const width = maxCellX - minCellX + 1;
  const height = maxCellY - minCellY + 1;
  const quality = new Uint8Array(width * height);
  const blocker = new Uint8Array(width * height);
  const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  const observerCondition = observerVisibilityCondition({
    fatigue: unit.soldier.condition.fatigue,
    confusion: unit.soldier.condition.confusion,
    health: unit.soldier.condition.health,
    suppression: unit.behaviorRuntime.suppression,
  });
  const originIndex = originCellY * staticGrid.width + originCellX;
  const originEye = staticGrid.terrainHeightMeters[originIndex] + eyeHeightForPosture(unit.behaviorRuntime.posture);
  const perimeter = perimeterCells(minCellX, minCellY, maxCellX, maxCellY);
  const diagnostics = getRuntime(state).diagnostics;
  diagnostics.processedCellCount = 0;
  diagnostics.rayCount = perimeter.length;

  setFieldCell(quality, blocker, width, minCellX, minCellY, originCellX, originCellY, 255, false);
  for (const target of perimeter) {
    let transmission = 1;
    let horizonSlope = Number.NEGATIVE_INFINITY;
    const cells = supercoverLine(originCellX, originCellY, target.x, target.y);
    let previousX = originCellX;
    let previousY = originCellY;
    for (let index = 1; index < cells.length; index += 1) {
      const cell = cells[index];
      const dx = cell.x + 0.5 - unit.position.x;
      const dy = cell.y + 0.5 - unit.position.y;
      const distanceCells = Math.hypot(dx, dy);
      const distanceMeters = distanceCells * state.map.metersPerCell;
      if (distanceMeters > unit.attentionSettings.vision.maximumVisualRangeMeters) break;
      const mapIndex = cell.y * staticGrid.width + cell.x;
      const terrainHeight = staticGrid.terrainHeightMeters[mapIndex];
      const targetSlope = (terrainHeight + TARGET_EYE_HEIGHT_METERS - originEye) / Math.max(0.001, distanceMeters);
      const blockedByHorizon = targetSlope + HORIZON_MARGIN < horizonSlope;
      const stepMeters = Math.hypot(cell.x - previousX, cell.y - previousY) * state.map.metersPerCell;
      previousX = cell.x;
      previousY = cell.y;
      const forestKind = staticGrid.forestKind[mapIndex];
      if (forestKind > 0) {
        const loss = forestKind === 2 ? DENSE_FOREST_LOSS_PER_METER : SPARSE_FOREST_LOSS_PER_METER;
        transmission *= Math.exp(-loss * stepMeters);
      }
      const bearing = Math.atan2(dy, dx);
      const angleDifferenceDegrees = normalizeSignedDegrees(
        radiansToDegrees(bearing - unit.attentionRuntime.focusDirectionRadians),
      );
      const attention = sampleAttentionWeight(profile, angleDifferenceDegrees);
      const evaluated = evaluateCellVisibilityQuality({
        blocked: blockedByHorizon || transmission <= FOREST_MIN_TRANSMISSION,
        visualTransmission: transmission,
        distanceMeters,
        attentionWeight: attention.weight,
        observerCondition,
        vision: unit.attentionSettings.vision,
      });
      const encoded = Math.round(evaluated.quality01 * 255);
      setFieldCell(
        quality,
        blocker,
        width,
        minCellX,
        minCellY,
        cell.x,
        cell.y,
        encoded,
        evaluated.blocked || staticGrid.blockingFlags[mapIndex] === 1,
      );
      diagnostics.processedCellCount += 1;

      const groundSlope = (terrainHeight - originEye) / Math.max(0.001, distanceMeters);
      horizonSlope = Math.max(horizonSlope, groundSlope);
      if (staticGrid.blockingFlags[mapIndex] === 1) {
        const objectSlope = (staticGrid.objectTopHeightMeters[mapIndex] - originEye) / Math.max(0.001, distanceMeters);
        horizonSlope = Math.max(horizonSlope, objectSlope);
      }
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
    blocker,
    revision,
    calculationKey,
    mapVisualRevision: staticGrid.mapVisualRevision,
    builtAtSeconds: state.simulationTimeSeconds,
  };
}

function buildCalculationKey(state: SimulationState, unit: UnitModel, mapVisualRevision: number): string {
  const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  return [
    'view-memory:v1',
    unit.id,
    quantize(unit.position.x, POSITION_QUANTUM_CELLS),
    quantize(unit.position.y, POSITION_QUANTUM_CELLS),
    unit.behaviorRuntime.posture,
    unit.attentionRuntime.mode,
    quantize(unit.attentionRuntime.focusDirectionRadians, 0.05),
    profile.focusAngleDegrees.toFixed(1),
    profile.directAngleDegrees.toFixed(1),
    profile.focusWeight.toFixed(3),
    profile.directWeight.toFixed(3),
    profile.peripheralWeight.toFixed(3),
    unit.attentionSettings.vision.maximumVisualRangeMeters.toFixed(1),
    unit.attentionSettings.vision.distanceFalloffStartMeters.toFixed(1),
    unit.attentionSettings.vision.distanceFalloffExponent.toFixed(2),
    mapVisualRevision,
    state.map.metersPerCell.toFixed(3),
  ].join(':');
}

function perimeterCells(minX: number, minY: number, maxX: number, maxY: number): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [];
  for (let x = minX; x <= maxX; x += 1) {
    result.push({ x, y: minY });
    if (maxY !== minY) result.push({ x, y: maxY });
  }
  for (let y = minY + 1; y < maxY; y += 1) {
    result.push({ x: minX, y });
    if (maxX !== minX) result.push({ x: maxX, y });
  }
  return result;
}

function supercoverLine(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const signX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const signY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  let x = x0;
  let y = y0;
  let ix = 0;
  let iy = 0;
  points.push({ x, y });
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      x += signX;
      y += signY;
      ix += 1;
      iy += 1;
    } else if (decision < 0) {
      x += signX;
      ix += 1;
    } else {
      y += signY;
      iy += 1;
    }
    points.push({ x, y });
  }
  return points;
}

function setFieldCell(
  quality: Uint8Array,
  blocker: Uint8Array,
  width: number,
  minX: number,
  minY: number,
  cellX: number,
  cellY: number,
  value: number,
  blocked: boolean,
): void {
  const x = cellX - minX;
  const y = cellY - minY;
  if (x < 0 || y < 0 || x >= width || y >= blocker.length / width) return;
  const index = y * width + x;
  if (value > quality[index]) quality[index] = value;
  if (blocked) blocker[index] = 1;
}

function getRuntime(state: SimulationState): VisibilityFieldRuntime {
  let runtime = runtimeByState.get(state);
  if (!runtime) {
    runtime = {
      field: null,
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
      lastObserverPosition: null,
    };
    runtimeByState.set(state, runtime);
  }
  return runtime;
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
