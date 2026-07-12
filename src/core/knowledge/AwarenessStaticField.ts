import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { getCell, resolveObjectCoverProperties, type MapObject, type TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import { getMapObjectSpatialIndex } from '../spatial/MapObjectSpatialIndex';

export interface AwarenessStaticField {
  key: string;
  width: number;
  height: number;
  metersPerCell: number;
  expectedProtection: Uint8Array;
  reliability: Uint8Array;
  concealment: Uint8Array;
  terrainPenalty: Uint8Array;
  sourceRu: string[];
}

export interface AwarenessStaticCell {
  expectedProtection: number;
  reliability: number;
  concealment: number;
  terrainPenalty: number;
  sourceRu: string;
}

export interface AwarenessStaticFieldDiagnostics {
  buildCount: number;
  cacheHitCount: number;
  lastBuildMs: number;
  lastCandidateChecks: number;
  key: string;
}

interface CachedPostureField {
  field: AwarenessStaticField;
  diagnostics: AwarenessStaticFieldDiagnostics;
}

const cache = new WeakMap<TacticalMap, Map<UnitPosture, CachedPostureField>>();

export function getAwarenessStaticField(map: TacticalMap, posture: UnitPosture): AwarenessStaticField {
  const key = buildStaticFieldKey(map, posture);
  let byPosture = cache.get(map);
  if (!byPosture) {
    byPosture = new Map<UnitPosture, CachedPostureField>();
    cache.set(map, byPosture);
  }

  const existing = byPosture.get(posture);
  if (existing?.field.key === key) {
    existing.diagnostics.cacheHitCount += 1;
    return existing.field;
  }

  const startedAt = performance.now();
  const cellCount = map.width * map.height;
  const expectedProtection = new Uint8Array(cellCount);
  const reliability = new Uint8Array(cellCount);
  const concealment = new Uint8Array(cellCount);
  const terrainPenalty = new Uint8Array(cellCount);
  const sourceRu = new Array<string>(cellCount);
  const spatialIndex = getMapObjectSpatialIndex(map);
  let candidateChecks = 0;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const position = { x: x + 0.5, y: y + 0.5 };
      const cell = getCell(map, x, y);
      const candidates = spatialIndex.queryCircle(position, 0.75);
      const local = estimateLocalProtection(map, position, posture, candidates);
      candidateChecks += candidates.length;
      expectedProtection[index] = local.expectedProtection;
      reliability[index] = local.reliability;
      concealment[index] = local.concealment;
      terrainPenalty[index] = movementPenalty(cell?.terrain ?? 'field');
      sourceRu[index] = local.sourceRu;
    }
  }

  const field: AwarenessStaticField = {
    key,
    width: map.width,
    height: map.height,
    metersPerCell: map.metersPerCell,
    expectedProtection,
    reliability,
    concealment,
    terrainPenalty,
    sourceRu,
  };
  const diagnostics: AwarenessStaticFieldDiagnostics = {
    buildCount: (existing?.diagnostics.buildCount ?? 0) + 1,
    cacheHitCount: existing?.diagnostics.cacheHitCount ?? 0,
    lastBuildMs: performance.now() - startedAt,
    lastCandidateChecks: candidateChecks,
    key,
  };
  byPosture.set(posture, { field, diagnostics });
  return field;
}

export function getAwarenessStaticCell(field: AwarenessStaticField, position: GridPosition): AwarenessStaticCell {
  const x = clampInt(Math.floor(position.x), 0, field.width - 1);
  const y = clampInt(Math.floor(position.y), 0, field.height - 1);
  const index = y * field.width + x;
  return {
    expectedProtection: field.expectedProtection[index] ?? 0,
    reliability: field.reliability[index] ?? 0,
    concealment: field.concealment[index] ?? 0,
    terrainPenalty: field.terrainPenalty[index] ?? 0,
    sourceRu: field.sourceRu[index] ?? 'открытая местность',
  };
}

export function getAwarenessStaticFieldDiagnostics(
  map: TacticalMap,
  posture: UnitPosture,
): AwarenessStaticFieldDiagnostics {
  const existing = cache.get(map)?.get(posture);
  if (!existing) return { buildCount: 0, cacheHitCount: 0, lastBuildMs: 0, lastCandidateChecks: 0, key: '' };
  return { ...existing.diagnostics };
}

function buildStaticFieldKey(map: TacticalMap, posture: UnitPosture): string {
  const revisions = getMapRevisionSnapshot(map);
  return [
    map.width,
    map.height,
    map.metersPerCell,
    posture,
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
  ].join(':');
}

function estimateLocalProtection(
  map: TacticalMap,
  position: GridPosition,
  posture: UnitPosture,
  candidates: MapObject[],
): { expectedProtection: number; reliability: number; concealment: number; sourceRu: string } {
  const cell = getCell(map, Math.floor(position.x), Math.floor(position.y));
  const terrainConcealment = forestConcealment(cell?.forest ?? 0);
  const reliefProtection = reliefLocalProtection(map, position, posture);
  let result = {
    expectedProtection: reliefProtection,
    reliability: reliefProtection,
    concealment: clampPercent(terrainConcealment + postureConcealmentBonus(posture)),
    sourceRu: terrainConcealment > 0 ? 'лес' : reliefProtection > 0 ? 'складка местности' : 'открытая местность',
  };

  for (const object of candidates) {
    if (!isNearObject(position, object.x, object.y, object.widthCells, object.heightCells, object.rotationRadians)) continue;
    const cover = resolveObjectCoverProperties(object);
    const postureFactor = coverPostureFactor(posture, cover.coverPosture);
    const protection = clampPercent(cover.coverProtection * postureFactor);
    const reliability = clampPercent(cover.coverReliability * postureFactor);
    const concealment = clampPercent(Math.max(result.concealment, cover.concealment + postureConcealmentBonus(posture)));
    if (protection > result.expectedProtection || concealment > result.concealment) {
      result = {
        expectedProtection: Math.max(result.expectedProtection, protection),
        reliability: Math.max(result.reliability, reliability),
        concealment,
        sourceRu: object.labels?.ru ?? object.kind,
      };
    }
  }
  return result;
}

function isNearObject(
  position: GridPosition,
  objectX: number,
  objectY: number,
  width: number,
  height: number,
  rotation: number,
): boolean {
  const centerX = objectX + 0.5;
  const centerY = objectY + 0.5;
  const dx = position.x - centerX;
  const dy = position.y - centerY;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const margin = 0.65;
  return Math.abs(localX) <= width / 2 + margin && Math.abs(localY) <= height / 2 + margin;
}

function coverPostureFactor(posture: UnitPosture, coverPosture: UnitPosture): number {
  if (coverPosture === 'standing') return 1;
  if (coverPosture === 'crouched') return posture === 'standing' ? 0.45 : 1;
  return posture === 'prone' ? 1 : posture === 'crouched' ? 0.55 : 0.25;
}

function reliefLocalProtection(map: TacticalMap, position: GridPosition, posture: UnitPosture): number {
  const center = getCell(map, Math.floor(position.x), Math.floor(position.y));
  if (!center) return 0;
  const neighbors = [
    getCell(map, center.x - 1, center.y),
    getCell(map, center.x + 1, center.y),
    getCell(map, center.x, center.y - 1),
    getCell(map, center.x, center.y + 1),
  ].filter(Boolean);
  const rise = Math.max(0, ...neighbors.map((neighbor) => (neighbor?.height ?? center.height) - center.height));
  const postureBonus = posture === 'prone' ? 18 : posture === 'crouched' ? 9 : 0;
  return clampPercent(rise * 22 + postureBonus);
}

function forestConcealment(forest: number): number {
  return forest === 2 ? 82 : forest === 1 ? 52 : 0;
}

function postureConcealmentBonus(posture: UnitPosture): number {
  if (posture === 'prone') return 18;
  if (posture === 'crouched') return 8;
  return 0;
}

function movementPenalty(terrain: string): number {
  if (terrain === 'water') return 35;
  if (terrain === 'swamp') return 18;
  if (terrain === 'rough') return 7;
  return 0;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
