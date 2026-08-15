import type { GridPosition } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';
import { getDirectionalTerrainStaticGrid } from '../terrain/DirectionalTerrainStaticGrid';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import { getActiveEnvironmentProfile } from './EnvironmentProfileRuntime';
import { getSurfaceMaterial, getVegetationMaterial } from './EnvironmentMaterialProfile';
import { circleIntersectsMapObject } from './MapObjectGeometry';
import {
  getCell,
  gridToCellLabel,
  resolveObjectCoverProperties,
  type CoverPosture,
  type MapObjectKind,
} from './MapModel';

export interface MapInfoReadOptions {
  /** Display-only radius. It does not affect simulation or gameplay queries. */
  readonly nearbyRadiusCells?: number;
}

export interface MapInfoObjectReadModel {
  readonly id: string;
  readonly kind: MapObjectKind;
  readonly labelRu: string;
  readonly inPoint: boolean;
  readonly coverProtection: number;
  readonly coverReliability: number;
  readonly concealment: number;
  readonly penetrable: boolean;
  readonly coverPosture: CoverPosture;
}

export interface MapInfoUnitReadModel {
  readonly unitId: string;
  readonly labelRu: string;
  readonly side: string;
  readonly distanceCells: number;
  readonly distanceMeters: number;
}

export interface MapInfoReadModel {
  readonly point: GridPosition;
  readonly cellX: number;
  readonly cellY: number;
  readonly cellLabel: string;
  readonly heightLevel: number;
  readonly slopeGrade: number;
  readonly slopeDegrees: number;
  readonly downhillBearingRadians: number | null;
  readonly surface: {
    readonly id: string;
    readonly nameRu: string;
    readonly passable: boolean;
    readonly physicalCost: number;
    readonly resistance: number;
  };
  readonly vegetation: {
    readonly id: string;
    readonly nameRu: string;
    readonly movementResistance: number;
    readonly tacticalConcealment: number;
    readonly targetConcealment: number;
    readonly localConcealment: number;
    readonly fireProtectionPerMeter: number;
    readonly maximumFireProtection: number;
  };
  readonly effectiveMovementResistance: number;
  readonly nearbyRadiusCells: number;
  readonly objects: readonly MapInfoObjectReadModel[];
  readonly units: readonly MapInfoUnitReadModel[];
}

/**
 * Canonical read-only projection for the Polygon "Инфо" inspector.
 * It exposes existing terrain/material/object semantics without inventing an
 * aggregate gameplay score for concealment or protection.
 */
export function buildMapInfoReadModel(
  state: SimulationState,
  point: GridPosition,
  options: MapInfoReadOptions = {},
): MapInfoReadModel | null {
  const cellX = Math.floor(point.x);
  const cellY = Math.floor(point.y);
  const cell = getCell(state.map, cellX, cellY);
  if (!cell) return null;

  const profile = getActiveEnvironmentProfile();
  const surface = getSurfaceMaterial(profile, cell.surfaceMaterialId);
  const vegetation = getVegetationMaterial(profile, cell.vegetationMaterialId);
  const nearbyRadiusCells = finiteRadius(options.nearbyRadiusCells, 1.5);
  const terrain = getDirectionalTerrainStaticGrid(state.map);
  const index = cellY * state.map.width + cellX;
  const slopeGrade = Math.max(0, terrain.slopeMagnitude[index] ?? 0);
  const downhillX = terrain.downhillX[index] ?? 0;
  const downhillY = terrain.downhillY[index] ?? 0;
  const downhillBearingRadians = Math.hypot(downhillX, downhillY) > 1e-6
    ? Math.atan2(downhillY, downhillX)
    : null;

  const objects = state.map.objects
    .filter((object) => circleIntersectsMapObject(object, point, nearbyRadiusCells))
    .map((object) => {
      const cover = resolveObjectCoverProperties(object);
      return {
        id: object.id,
        kind: object.kind,
        labelRu: object.labels?.ru ?? object.id,
        inPoint: circleIntersectsMapObject(object, point, 0),
        coverProtection: cover.coverProtection,
        coverReliability: cover.coverReliability,
        concealment: cover.concealment,
        penetrable: cover.penetrable,
        coverPosture: cover.coverPosture,
      } satisfies MapInfoObjectReadModel;
    });

  const units = state.units
    .map((unit) => {
      const distanceCells = Math.hypot(unit.position.x - point.x, unit.position.y - point.y);
      return {
        unitId: unit.id,
        labelRu: unit.labels.ru,
        side: unit.side,
        distanceCells,
        distanceMeters: distanceCells * state.map.metersPerCell,
      } satisfies MapInfoUnitReadModel;
    })
    .filter((unit) => unit.distanceCells <= nearbyRadiusCells)
    .sort((left, right) => left.distanceCells - right.distanceCells || left.unitId.localeCompare(right.unitId));

  return {
    point: { ...point },
    cellX,
    cellY,
    cellLabel: gridToCellLabel(state.map, point),
    heightLevel: sampleSmoothHeightLevel(state.map, point.x, point.y),
    slopeGrade,
    slopeDegrees: Math.atan(slopeGrade) * 180 / Math.PI,
    downhillBearingRadians,
    surface: {
      id: surface.id,
      nameRu: surface.nameRu,
      passable: surface.movement.passable,
      physicalCost: surface.movement.physicalCost,
      resistance: surface.movement.resistance,
    },
    vegetation: {
      id: vegetation.id,
      nameRu: vegetation.nameRu,
      movementResistance: vegetation.movement.resistance,
      tacticalConcealment: vegetation.movement.tacticalConcealment,
      targetConcealment: vegetation.visibility.targetConcealment,
      localConcealment: vegetation.visibility.localConcealment,
      fireProtectionPerMeter: vegetation.fire.protectionPerMeter,
      maximumFireProtection: vegetation.fire.maximumProtection,
    },
    effectiveMovementResistance: surface.movement.resistance * vegetation.movement.resistance,
    nearbyRadiusCells,
    objects,
    units,
  };
}

function finiteRadius(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}
