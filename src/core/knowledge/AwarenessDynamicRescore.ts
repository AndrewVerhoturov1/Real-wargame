import {
  getThreatRelativeCoverField,
  type ThreatRelativeCoverField,
} from '../cover/ThreatRelativeCoverField';
import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import {
  readDirectionalExposureForBearing,
  readDirectionalProtectionForBearing,
  type DirectionalTacticalField,
} from '../terrain/DirectionalTacticalField';
import type { KnownThreatMemory, UnitModel } from '../units/UnitModel';
import type { AwarenessStaticField } from './AwarenessStaticField';
import type { SoldierAwarenessCell } from './SoldierAwarenessGrid';

const UNCERTAINTY_SCORE_PER_METER = 0.5;
const DIRECTIONAL_UNCERTAINTY_ARC_DEGREES_PER_METER = 1;

interface ThreatCellGeometry {
  readonly threatId: string;
  readonly factor: Float32Array;
  readonly protection: Uint8Array;
  readonly exposureFactor: Float32Array;
  readonly uncertaintyMeters: number;
}

interface DynamicRescoreRuntime {
  geometryKey: string;
  threatGeometry: ThreatCellGeometry[] | null;
  geometryBuildCount: number;
  dynamicRescoreCount: number;
  rescoredCellCount: number;
  lastGeometryBuildMs: number;
  lastRescoreMs: number;
  maxRescoreMs: number;
}

export interface AwarenessDynamicRescoreDiagnostics {
  readonly geometryBuildCount: number;
  readonly dynamicRescoreCount: number;
  readonly rescoredCellCount: number;
  readonly lastGeometryBuildMs: number;
  readonly lastRescoreMs: number;
  readonly maxRescoreMs: number;
  readonly geometryReady: boolean;
  readonly geometryKey: string;
}

const runtimeByUnit = new WeakMap<UnitModel, DynamicRescoreRuntime>();

export function rememberAwarenessGeometrySignature(
  map: TacticalMap,
  unit: UnitModel,
  staticField: AwarenessStaticField,
  directionalField: DirectionalTacticalField,
): void {
  const key = buildGeometryKey(map, unit, staticField, directionalField);
  const runtime = getRuntime(unit);
  if (runtime.geometryKey === key) return;
  runtime.geometryKey = key;
  runtime.threatGeometry = null;
}

export function tryRescoreAwarenessField(
  map: TacticalMap,
  unit: UnitModel,
  cells: SoldierAwarenessCell[],
  staticField: AwarenessStaticField,
  directionalField: DirectionalTacticalField,
): boolean {
  const key = buildGeometryKey(map, unit, staticField, directionalField);
  const runtime = runtimeByUnit.get(unit);
  if (!runtime || runtime.geometryKey !== key || cells.length !== map.width * map.height) return false;

  if (!runtime.threatGeometry) {
    const startedAt = performance.now();
    runtime.threatGeometry = buildThreatGeometry(map, unit, staticField, directionalField);
    runtime.geometryBuildCount += 1;
    runtime.lastGeometryBuildMs = performance.now() - startedAt;
  }

  if (!threatGeometryMatches(runtime.threatGeometry, unit.tacticalKnowledge.threats)) return false;

  const startedAt = performance.now();
  const threats = unit.tacticalKnowledge.threats;
  for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
    const cell = cells[cellIndex];
    if (!cell) return false;

    let remainingSafe = 1;
    let remainingUnsuppressed = 1;
    let confidenceTotal = 0;
    let confidenceWeight = 0;
    let uncertainty = 0;
    let expectedProtectionAgainstThreat = 0;
    let protectedAgainstThreatId: string | null = null;

    for (let threatIndex = 0; threatIndex < threats.length; threatIndex += 1) {
      const threat = threats[threatIndex];
      const geometry = runtime.threatGeometry[threatIndex];
      const factor = geometry.factor[cellIndex] ?? 0;
      if (factor <= 0) continue;

      const threatProtection = geometry.protection[cellIndex] ?? 0;
      if (threatProtection > expectedProtectionAgainstThreat) {
        expectedProtectionAgainstThreat = threatProtection;
        protectedAgainstThreatId = threat.id;
      }

      const confidenceFactor = threat.confidence / 100;
      const uncovered = 1 - threatProtection / 100;
      const exposureFactor = geometry.exposureFactor[cellIndex] || 1;
      const danger = clampPercent(threat.strength * factor * confidenceFactor * uncovered * exposureFactor);
      const suppression = clampPercent(threat.suppression * factor * confidenceFactor * uncovered * exposureFactor);
      remainingSafe *= 1 - danger / 100;
      remainingUnsuppressed *= 1 - suppression / 100;
      confidenceTotal += threat.confidence * factor;
      confidenceWeight += factor;
      uncertainty = Math.max(
        uncertainty,
        clampPercent((100 - threat.confidence) + geometry.uncertaintyMeters * UNCERTAINTY_SCORE_PER_METER),
      );
    }

    const danger = clampPercent(100 * (1 - remainingSafe));
    const suppression = clampPercent(100 * (1 - remainingUnsuppressed));
    cell.danger = danger;
    cell.suppression = suppression;
    cell.expectedProtectionAgainstThreat = expectedProtectionAgainstThreat;
    cell.protectedAgainstThreatId = protectedAgainstThreatId;
    cell.uncertainty = uncertainty;
    cell.confidence = confidenceWeight > 0 ? clampPercent(confidenceTotal / confidenceWeight) : 0;
    cell.safety = clampPercent(
      cell.expectedProtection * 0.58
        + cell.concealment * 0.24
        + (100 - danger) * 0.45
        - suppression * 0.16
        - uncertainty * 0.08
        - (staticField.terrainPenalty[cellIndex] ?? 0)
        - cell.forwardSlopeRisk * 0.10
        - cell.silhouetteRisk * 0.15
        - cell.flankExposure * 0.08,
    );
  }

  runtime.dynamicRescoreCount += 1;
  runtime.rescoredCellCount += cells.length;
  runtime.lastRescoreMs = performance.now() - startedAt;
  runtime.maxRescoreMs = Math.max(runtime.maxRescoreMs, runtime.lastRescoreMs);
  return true;
}

export function getAwarenessDynamicRescoreDiagnostics(
  unit: UnitModel,
): AwarenessDynamicRescoreDiagnostics {
  const runtime = runtimeByUnit.get(unit);
  if (!runtime) {
    return {
      geometryBuildCount: 0,
      dynamicRescoreCount: 0,
      rescoredCellCount: 0,
      lastGeometryBuildMs: 0,
      lastRescoreMs: 0,
      maxRescoreMs: 0,
      geometryReady: false,
      geometryKey: '',
    };
  }
  return {
    geometryBuildCount: runtime.geometryBuildCount,
    dynamicRescoreCount: runtime.dynamicRescoreCount,
    rescoredCellCount: runtime.rescoredCellCount,
    lastGeometryBuildMs: runtime.lastGeometryBuildMs,
    lastRescoreMs: runtime.lastRescoreMs,
    maxRescoreMs: runtime.maxRescoreMs,
    geometryReady: runtime.threatGeometry !== null,
    geometryKey: runtime.geometryKey,
  };
}

function buildThreatGeometry(
  map: TacticalMap,
  unit: UnitModel,
  staticField: AwarenessStaticField,
  directionalField: DirectionalTacticalField,
): ThreatCellGeometry[] {
  const cellCount = map.width * map.height;
  const result: ThreatCellGeometry[] = [];

  for (const threat of unit.tacticalKnowledge.threats) {
    const factor = new Float32Array(cellCount);
    const protection = new Uint8Array(cellCount);
    const exposureFactor = new Float32Array(cellCount);
    const coverField = threat.mode === 'directional_fire'
      ? getThreatRelativeCoverField(map, {
          threatId: threat.id,
          threatPosition: { x: threat.x, y: threat.y },
          posture: unit.behaviorRuntime.posture,
        })
      : null;

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const cellIndex = y * map.width + x;
        const position = { x: x + 0.5, y: y + 0.5 };
        const threatFactor = threatFactorAtPosition(position, threat, staticField.metersPerCell);
        if (threatFactor <= 0) continue;

        const bearingToThreat = Math.atan2(threat.y - position.y, threat.x - position.x);
        const terrainProtection = readDirectionalProtectionForBearing(
          directionalField,
          position.x,
          position.y,
          bearingToThreat,
        );
        const terrainExposure = readDirectionalExposureForBearing(
          directionalField,
          position.x,
          position.y,
          bearingToThreat,
        );
        const threatProtection = threat.mode === 'directional_fire'
          ? combinePercent(coverProtectionAt(coverField!, cellIndex), terrainProtection)
          : combinePercent(staticField.expectedProtection[cellIndex] ?? 0, terrainProtection * 0.35);

        factor[cellIndex] = threatFactor;
        protection[cellIndex] = threatProtection;
        exposureFactor[cellIndex] = threat.mode === 'directional_fire'
          ? 0.72 + terrainExposure / 100 * 0.28
          : 1;
      }
    }

    result.push({
      threatId: threat.id,
      factor,
      protection,
      exposureFactor,
      uncertaintyMeters: threat.uncertaintyCells * staticField.metersPerCell,
    });
  }

  return result;
}

function coverProtectionAt(field: ThreatRelativeCoverField, index: number): number {
  return field.protection[index] ?? 0;
}

function threatGeometryMatches(
  geometry: readonly ThreatCellGeometry[],
  threats: readonly KnownThreatMemory[],
): boolean {
  return geometry.length === threats.length
    && geometry.every((entry, index) => entry.threatId === threats[index]?.id);
}

function buildGeometryKey(
  map: TacticalMap,
  unit: UnitModel,
  staticField: AwarenessStaticField,
  directionalField: DirectionalTacticalField,
): string {
  return [
    map.width,
    map.height,
    staticField.key,
    directionalField.key,
    unit.behaviorRuntime.posture,
    unit.tacticalKnowledge.threats.map((threat) => [
      threat.id,
      threat.mode,
      quantize(threat.x, 0.05),
      quantize(threat.y, 0.05),
      quantize(threat.radiusCells, 0.1),
      quantize(threat.widthCells, 0.1),
      quantize(threat.heightCells, 0.1),
      quantize(threat.rotationDegrees, 1),
      quantize(threat.directionDegrees, 1),
      quantize(threat.arcDegrees, 1),
      quantize(threat.rangeCells, 0.1),
      quantize(threat.minRangeCells, 0.1),
      quantize(threat.falloffPercent, 1),
      quantize(threat.uncertaintyCells, 1),
    ].join(':')).join('|'),
  ].join('#');
}

function threatFactorAtPosition(
  position: GridPosition,
  threat: KnownThreatMemory,
  metersPerCell: number,
): number {
  const dx = position.x - threat.x;
  const dy = position.y - threat.y;
  const range = Math.hypot(dx, dy);
  const uncertaintyBonus = threat.uncertaintyCells;

  if (threat.mode === 'directional_fire') {
    if (range < Math.max(0, threat.minRangeCells - uncertaintyBonus)) return 0;
    if (range > threat.rangeCells + uncertaintyBonus) return 0;
    const bearing = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
    const uncertaintyMeters = uncertaintyBonus * metersPerCell;
    const allowedArc = Math.min(
      360,
      threat.arcDegrees + uncertaintyMeters * DIRECTIONAL_UNCERTAINTY_ARC_DEGREES_PER_METER,
    );
    if (angularDifference(bearing, threat.directionDegrees) > allowedArc / 2) return 0;
    const progress = Math.max(
      0,
      Math.min(1, (range - threat.minRangeCells) / Math.max(0.001, threat.rangeCells - threat.minRangeCells)),
    );
    return Math.max(0.05, 1 - progress * threat.falloffPercent / 100);
  }

  if (threat.radiusCells > 0) {
    return range <= threat.radiusCells + uncertaintyBonus
      ? Math.max(0.2, 1 - range / Math.max(1, threat.radiusCells + uncertaintyBonus) * 0.35)
      : 0;
  }

  const rotation = -(threat.rotationDegrees ?? 0) * Math.PI / 180;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  return Math.abs(localX) <= threat.widthCells / 2 + uncertaintyBonus
    && Math.abs(localY) <= threat.heightCells / 2 + uncertaintyBonus
    ? 1
    : 0;
}

function getRuntime(unit: UnitModel): DynamicRescoreRuntime {
  const existing = runtimeByUnit.get(unit);
  if (existing) return existing;
  const created: DynamicRescoreRuntime = {
    geometryKey: '',
    threatGeometry: null,
    geometryBuildCount: 0,
    dynamicRescoreCount: 0,
    rescoredCellCount: 0,
    lastGeometryBuildMs: 0,
    lastRescoreMs: 0,
    maxRescoreMs: 0,
  };
  runtimeByUnit.set(unit, created);
  return created;
}

function combinePercent(base: number, addition: number): number {
  const base01 = clampPercent(base) / 100;
  const addition01 = clampPercent(addition) / 100;
  return clampPercent((1 - (1 - base01) * (1 - addition01)) * 100);
}

function quantize(value: number, bucket: number): number {
  return Math.round(value / bucket) * bucket;
}

function normalizeDegrees(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
