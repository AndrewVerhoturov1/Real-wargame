import type { UnitPosture } from '../behavior/BehaviorModel';
import { evaluateSmallArmsCover } from '../cover/SmallArmsCoverEvaluation';
import type { TacticalMap } from '../map/MapModel';
import type { UnitModel } from '../units/UnitModel';
import { computeLineOfSight } from '../visibility/LineOfSight';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import type { RouteCostFields, TacticalRouteContext, TacticalRouteKnownThreat } from './RouteCostField';

const MAX_ROUTE_DANGER_SAMPLES = 64;
const MAX_BOUNDED_ROUTE_DANGER_SAMPLES = 32;

export interface RouteDangerCell {
  readonly x: number;
  readonly y: number;
}

export interface RouteDangerMapRevisions {
  readonly terrain: number;
  readonly height: number;
  readonly forest: number;
  readonly objects: number;
}

export interface RouteDangerDiagnostic {
  readonly version: 1;
  /** Average subjective danger along the published active route, 0..100. */
  readonly value: number;
  /** Monotonic within one published order runtime. */
  readonly revision: number;
  readonly routeIdentity: string;
  readonly threatSnapshotIdentity: string;
  readonly mapRevisions: RouteDangerMapRevisions;
  readonly knowledgeRevision: number;
  readonly navigationProfileRevision: number;
  readonly calculatedAtSimulationStep: number;
  readonly sampledCellCount: number;
  readonly source: 'route-cost-field' | 'bounded-route-sampling';
}

export interface BuildRouteDangerDiagnosticOptions {
  readonly revision: number;
  readonly calculatedAtSimulationStep: number;
  readonly tacticalContext?: TacticalRouteContext;
}

export interface BuildBoundedRouteDangerDiagnosticOptions extends BuildRouteDangerDiagnosticOptions {
  readonly navigationProfileRevision: number;
}

/**
 * Builds a bounded aggregate from the already-published route-cost field.
 * This never scans the map and never asks the awareness raster to rebuild.
 */
export function buildRouteDangerDiagnostic(
  map: TacticalMap,
  routeCells: readonly RouteDangerCell[],
  fields: RouteCostFields,
  options: BuildRouteDangerDiagnosticOptions,
): RouteDangerDiagnostic | null {
  if (routeCells.length === 0) return null;
  const usePublishedField = fields.availability.danger;
  const maximumSamples = usePublishedField ? MAX_ROUTE_DANGER_SAMPLES : MAX_BOUNDED_ROUTE_DANGER_SAMPLES;
  const sampleIndexes = evenlySpacedIndexes(0, routeCells.length - 1, maximumSamples);
  let total = 0;
  let count = 0;
  for (const routeIndex of sampleIndexes) {
    const cell = routeCells[routeIndex];
    if (!cell || cell.x < 0 || cell.y < 0 || cell.x >= fields.width || cell.y >= fields.height) continue;
    if (usePublishedField) {
      const fieldIndex = cell.y * fields.width + cell.x;
      total += fields.dangerPercent[fieldIndex] ?? 0;
    } else {
      total += evaluateBoundedSubjectiveDangerAt(
        map,
        { x: cell.x + 0.5, y: cell.y + 0.5 },
        options.tacticalContext,
      );
    }
    count += 1;
  }
  if (count === 0) return null;

  const revisions = getMapRevisionSnapshot(map);
  const threatSnapshotIdentity = usePublishedField
    ? fields.dangerFieldKey
    : buildTacticalThreatSnapshotIdentity(options.tacticalContext);
  const knowledgeRevision = usePublishedField
    ? fields.knowledgeRevision
    : options.tacticalContext?.knowledgeRevision ?? 0;
  return {
    version: 1,
    value: clampPercent(Math.round(total / count)),
    revision: Math.max(1, Math.floor(options.revision)),
    routeIdentity: buildRouteIdentity(routeCells),
    threatSnapshotIdentity,
    mapRevisions: {
      terrain: revisions.terrain,
      height: revisions.height,
      forest: revisions.forest,
      objects: revisions.objects,
    },
    knowledgeRevision,
    navigationProfileRevision: fields.profileRevision,
    calculatedAtSimulationStep: Math.max(0, Math.floor(options.calculatedAtSimulationStep)),
    sampledCellCount: count,
    source: usePublishedField ? 'route-cost-field' : 'bounded-route-sampling',
  };
}

/**
 * Recomputes an active-route aggregate from bounded route samples only.
 * Used when route/map/knowledge/profile identity changes without requiring a
 * route replan or a full worker-owned danger raster.
 */
export function buildBoundedRouteDangerDiagnostic(
  map: TacticalMap,
  routeCells: readonly RouteDangerCell[],
  options: BuildBoundedRouteDangerDiagnosticOptions,
): RouteDangerDiagnostic | null {
  if (routeCells.length === 0) return null;
  const sampleIndexes = evenlySpacedIndexes(0, routeCells.length - 1, MAX_BOUNDED_ROUTE_DANGER_SAMPLES);
  let total = 0;
  let count = 0;
  for (const routeIndex of sampleIndexes) {
    const cell = routeCells[routeIndex];
    if (!cell || cell.x < 0 || cell.y < 0 || cell.x >= map.width || cell.y >= map.height) continue;
    total += evaluateBoundedSubjectiveDangerAt(
      map,
      { x: cell.x + 0.5, y: cell.y + 0.5 },
      options.tacticalContext,
    );
    count += 1;
  }
  if (count === 0) return null;
  const revisions = getMapRevisionSnapshot(map);
  return {
    version: 1,
    value: clampPercent(Math.round(total / count)),
    revision: Math.max(1, Math.floor(options.revision)),
    routeIdentity: buildRouteIdentity(routeCells),
    threatSnapshotIdentity: buildTacticalThreatSnapshotIdentity(options.tacticalContext),
    mapRevisions: {
      terrain: revisions.terrain,
      height: revisions.height,
      forest: revisions.forest,
      objects: revisions.objects,
    },
    knowledgeRevision: options.tacticalContext?.knowledgeRevision ?? 0,
    navigationProfileRevision: Math.max(0, Math.floor(options.navigationProfileRevision)),
    calculatedAtSimulationStep: Math.max(0, Math.floor(options.calculatedAtSimulationStep)),
    sampledCellCount: count,
    source: 'bounded-route-sampling',
  };
}

export function routeDangerDiagnosticInputsMatch(
  diagnostic: RouteDangerDiagnostic | null | undefined,
  map: TacticalMap,
  routeCells: readonly RouteDangerCell[],
  navigationProfileRevision: number,
  tacticalContext?: TacticalRouteContext,
): boolean {
  if (!diagnostic || diagnostic.version !== 1 || routeCells.length === 0) return false;
  const revisions = getMapRevisionSnapshot(map);
  return diagnostic.routeIdentity === buildRouteIdentity(routeCells)
    && diagnostic.mapRevisions.terrain === revisions.terrain
    && diagnostic.mapRevisions.height === revisions.height
    && diagnostic.mapRevisions.forest === revisions.forest
    && diagnostic.mapRevisions.objects === revisions.objects
    && diagnostic.knowledgeRevision === (tacticalContext?.knowledgeRevision ?? 0)
    && diagnostic.navigationProfileRevision === navigationProfileRevision;
}

export function routeDangerDiagnosticMatches(
  diagnostic: RouteDangerDiagnostic | null | undefined,
  map: TacticalMap,
  routeCells: readonly RouteDangerCell[],
  fields: RouteCostFields,
  tacticalContext?: TacticalRouteContext,
): boolean {
  if (!diagnostic || diagnostic.version !== 1 || routeCells.length === 0) return false;
  const revisions = getMapRevisionSnapshot(map);
  const threatSnapshotIdentity = fields.availability.danger
    ? fields.dangerFieldKey
    : buildTacticalThreatSnapshotIdentity(tacticalContext);
  const knowledgeRevision = fields.availability.danger
    ? fields.knowledgeRevision
    : tacticalContext?.knowledgeRevision ?? 0;
  return diagnostic.routeIdentity === buildRouteIdentity(routeCells)
    && diagnostic.threatSnapshotIdentity === threatSnapshotIdentity
    && diagnostic.mapRevisions.terrain === revisions.terrain
    && diagnostic.mapRevisions.height === revisions.height
    && diagnostic.mapRevisions.forest === revisions.forest
    && diagnostic.mapRevisions.objects === revisions.objects
    && diagnostic.knowledgeRevision === knowledgeRevision
    && diagnostic.navigationProfileRevision === fields.profileRevision;
}


export function readPublishedRouteDanger(
  order: { readonly routeDangerDiagnostic?: RouteDangerDiagnostic } | null | undefined,
): number | null {
  return order?.routeDangerDiagnostic?.value ?? null;
}

export function normalizeRouteDangerDiagnostic(value: unknown): RouteDangerDiagnostic | undefined {
  if (!isRecord(value) || value.version !== 1 || (value.source !== 'route-cost-field' && value.source !== 'bounded-route-sampling')) return undefined;
  const mapRevisions = value.mapRevisions;
  if (!isRecord(mapRevisions)) return undefined;
  const numeric = [
    value.value,
    value.revision,
    value.knowledgeRevision,
    value.navigationProfileRevision,
    value.calculatedAtSimulationStep,
    value.sampledCellCount,
    mapRevisions.terrain,
    mapRevisions.height,
    mapRevisions.forest,
    mapRevisions.objects,
  ];
  if (numeric.some((item) => typeof item !== 'number' || !Number.isFinite(item))) return undefined;
  if (typeof value.routeIdentity !== 'string' || typeof value.threatSnapshotIdentity !== 'string') return undefined;
  return {
    version: 1,
    value: clampPercent(Math.round(value.value as number)),
    revision: Math.max(1, Math.floor(value.revision as number)),
    routeIdentity: value.routeIdentity,
    threatSnapshotIdentity: value.threatSnapshotIdentity,
    mapRevisions: {
      terrain: Math.max(0, Math.floor(mapRevisions.terrain as number)),
      height: Math.max(0, Math.floor(mapRevisions.height as number)),
      forest: Math.max(0, Math.floor(mapRevisions.forest as number)),
      objects: Math.max(0, Math.floor(mapRevisions.objects as number)),
    },
    knowledgeRevision: Math.max(0, Math.floor(value.knowledgeRevision as number)),
    navigationProfileRevision: Math.max(0, Math.floor(value.navigationProfileRevision as number)),
    calculatedAtSimulationStep: Math.max(0, Math.floor(value.calculatedAtSimulationStep as number)),
    sampledCellCount: Math.max(1, Math.floor(value.sampledCellCount as number)),
    source: value.source,
  };
}

export function cloneRouteDangerDiagnostic(
  diagnostic: RouteDangerDiagnostic | null | undefined,
): RouteDangerDiagnostic | undefined {
  return diagnostic ? {
    ...diagnostic,
    mapRevisions: { ...diagnostic.mapRevisions },
  } : undefined;
}

function evaluateBoundedSubjectiveDangerAt(
  map: TacticalMap,
  position: { readonly x: number; readonly y: number },
  context: TacticalRouteContext | undefined,
): number {
  const threats = context?.knownThreats ?? [];
  if (threats.length === 0) return 0;
  const posture = context?.posture ?? 'standing';
  let remainingSafe = 1;
  let rifleMaximum = 0;
  let machineGunMaximum = 0;
  for (const threat of threats) {
    let factor = threatFactorAtPosition(position.x, position.y, threat, map.metersPerCell);
    if (factor <= 0) continue;
    if (threat.mode === 'directional_fire') {
      const lineOfFire = computeLineOfSight(
        map,
        makeThreatProbeUnit(threat, posture),
        position,
        targetHeightForPosture(posture),
      );
      if (lineOfFire.blocked) continue;
      factor *= lineOfFire.visualTransmission;
    }
    const cover = threat.mode === 'directional_fire'
      ? evaluateSmallArmsCover(map, { x: threat.x, y: threat.y }, position, posture).expectedProtection
      : 0;
    const individual = clampPercent(
      threat.strength
        * factor
        * clampPercent(threat.confidence) / 100
        * (1 - cover / 100),
    );
    const fireClass = fireThreatClassForAggregation(threat);
    if (fireClass === 'rifle_fire') rifleMaximum = Math.max(rifleMaximum, individual);
    else if (fireClass === 'machine_gun_fire') machineGunMaximum = Math.max(machineGunMaximum, individual);
    else remainingSafe *= 1 - individual / 100;
  }
  if (rifleMaximum > 0) remainingSafe *= 1 - rifleMaximum / 100;
  if (machineGunMaximum > 0) remainingSafe *= 1 - machineGunMaximum / 100;
  return clampPercent(100 * (1 - remainingSafe));
}

function makeThreatProbeUnit(threat: TacticalRouteKnownThreat, posture: UnitPosture): UnitModel {
  return {
    position: { x: threat.x, y: threat.y },
    behaviorRuntime: { posture },
  } as unknown as UnitModel;
}

function threatFactorAtPosition(
  positionX: number,
  positionY: number,
  threat: TacticalRouteKnownThreat,
  metersPerCell: number,
): number {
  const dx = positionX - threat.x;
  const dy = positionY - threat.y;
  const range = Math.hypot(dx, dy);
  const uncertaintyBonus = threat.uncertaintyCells;
  if (threat.mode === 'directional_fire') {
    const minRangeCells = threat.minRangeCells ?? 0;
    const rangeCells = threat.rangeCells ?? 0;
    const arcDegrees = threat.arcDegrees ?? 360;
    const directionDegrees = threat.directionDegrees ?? 0;
    const falloffPercent = threat.falloffPercent ?? 0;
    if (range < Math.max(0, minRangeCells - uncertaintyBonus)) return 0;
    if (range > rangeCells + uncertaintyBonus) return 0;
    const bearing = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
    const uncertaintyMeters = uncertaintyBonus * metersPerCell;
    const allowedArc = Math.min(360, arcDegrees + uncertaintyMeters);
    if (angularDifference(bearing, directionDegrees) > allowedArc / 2) return 0;
    const progress = Math.max(0, Math.min(1,
      (range - minRangeCells) / Math.max(0.001, rangeCells - minRangeCells),
    ));
    return Math.max(0.05, 1 - progress * falloffPercent / 100);
  }
  if (threat.radiusCells > 0) {
    return range <= threat.radiusCells + uncertaintyBonus
      ? Math.max(0.2, 1 - range / Math.max(1, threat.radiusCells + uncertaintyBonus) * 0.35)
      : 0;
  }
  const rotation = -threat.rotationDegrees * Math.PI / 180;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  return Math.abs(localX) <= threat.widthCells / 2 + uncertaintyBonus
    && Math.abs(localY) <= threat.heightCells / 2 + uncertaintyBonus
    ? 1
    : 0;
}

function fireThreatClassForAggregation(threat: TacticalRouteKnownThreat): 'rifle_fire' | 'machine_gun_fire' | null {
  if (!threat.id.startsWith('unit:')) return null;
  return threat.fireThreatClass === 'machine_gun_fire' ? 'machine_gun_fire' : 'rifle_fire';
}

function buildTacticalThreatSnapshotIdentity(context: TacticalRouteContext | undefined): string {
  let hash = 2166136261;
  const posture = context?.posture ?? 'standing';
  hash = hashString(hash, posture);
  for (const threat of [...(context?.knownThreats ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    hash = hashString(hash, [
      threat.id, threat.mode, threat.x, threat.y, threat.radiusCells, threat.widthCells,
      threat.heightCells, threat.rotationDegrees, threat.strength, threat.confidence,
      threat.uncertaintyCells, threat.directionDegrees, threat.arcDegrees, threat.rangeCells,
      threat.minRangeCells, threat.falloffPercent, threat.fireThreatClass ?? 'independent',
    ].join(':'));
  }
  return `bounded-threats:${context?.knowledgeRevision ?? 0}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function hashString(hash: number, value: string): number {
  let next = hash;
  for (let index = 0; index < value.length; index += 1) {
    next ^= value.charCodeAt(index);
    next = Math.imul(next, 16777619);
  }
  return next;
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function targetHeightForPosture(posture: UnitPosture): number {
  if (posture === 'prone') return 0.35;
  if (posture === 'crouched') return 1.1;
  return 1.4;
}

function evenlySpacedIndexes(first: number, last: number, maximum: number): number[] {
  const count = last - first + 1;
  if (count <= maximum) return Array.from({ length: count }, (_, index) => first + index);
  const indexes: number[] = [];
  for (let sample = 0; sample < maximum; sample += 1) {
    indexes.push(Math.round(first + sample * (count - 1) / (maximum - 1)));
  }
  return indexes;
}

function buildRouteIdentity(routeCells: readonly RouteDangerCell[]): string {
  let hash = 2166136261;
  for (const cell of routeCells) {
    hash = hashNumber(hash, cell?.x ?? 0);
    hash = hashNumber(hash, cell?.y ?? 0);
  }
  return `route:${routeCells.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function hashNumber(hash: number, value: number): number {
  let next = hash;
  const normalized = Math.floor(value) | 0;
  for (let shift = 0; shift < 32; shift += 8) {
    next ^= (normalized >>> shift) & 0xff;
    next = Math.imul(next, 16777619);
  }
  return next;
}


function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
