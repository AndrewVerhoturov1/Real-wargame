import {
  EnvironmentProfileRegistry,
  surfaceMaterialIdToTerrainKind,
  terrainKindToSurfaceMaterialId,
  vegetationMaterialIdToLegacyForestLayer,
  type EnvironmentMaterialProfile,
} from '../map/EnvironmentMaterialProfile';
import { installEnvironmentProfileRegistry } from '../map/EnvironmentProfileRuntime';
import type { ElevationLevel, MapCell, TacticalMap } from '../map/MapModel';
import type { AwarenessWorkerMapSnapshot } from './AwarenessWorldWorkerProtocol';

export function buildAwarenessWorkerMapSnapshot(
  map: TacticalMap,
  mapKey: string,
  environmentProfile: EnvironmentMaterialProfile,
): AwarenessWorkerMapSnapshot {
  const count = map.width * map.height;
  const surfaceMaterialIds = Object.keys(environmentProfile.surfaces);
  const vegetationMaterialIds = Object.keys(environmentProfile.vegetation);
  const surfaceCodeById = new Map(surfaceMaterialIds.map((id, index) => [id, index]));
  const vegetationCodeById = new Map(vegetationMaterialIds.map((id, index) => [id, index]));
  const surfaceMaterialCodes = new Uint16Array(count);
  const vegetationMaterialCodes = new Uint16Array(count);
  const heightLevels = new Int8Array(count);
  const defaultSurfaceMaterialId = terrainKindToSurfaceMaterialId(map.defaultTerrain);
  const defaultVegetationMaterialId = 'none';
  const defaultSurfaceCode = surfaceCodeById.get(defaultSurfaceMaterialId) ?? surfaceCodeById.get('field') ?? 0;
  const defaultVegetationCode = vegetationCodeById.get(defaultVegetationMaterialId) ?? 0;

  for (let index = 0; index < count; index += 1) {
    const cell = map.cells[index];
    surfaceMaterialCodes[index] = surfaceCodeById.get(cell?.surfaceMaterialId ?? defaultSurfaceMaterialId) ?? defaultSurfaceCode;
    vegetationMaterialCodes[index] = vegetationCodeById.get(cell?.vegetationMaterialId ?? defaultVegetationMaterialId) ?? defaultVegetationCode;
    heightLevels[index] = cell?.height ?? map.defaultHeight;
  }

  return {
    mapKey,
    width: map.width,
    height: map.height,
    cellSize: map.cellSize,
    metersPerCell: map.metersPerCell,
    sourceToRuntimeCellScale: map.sourceToRuntimeCellScale,
    environmentProfile,
    defaultSurfaceMaterialId,
    defaultVegetationMaterialId,
    defaultHeight: map.defaultHeight,
    surfaceMaterialIds,
    vegetationMaterialIds,
    surfaceMaterialCodes,
    vegetationMaterialCodes,
    heightLevels,
    objects: map.objects.map((object) => ({
      ...object,
      labels: object.labels ? { ...object.labels } : null,
    })),
  };
}

export function installAwarenessWorkerEnvironmentProfile(snapshot: AwarenessWorkerMapSnapshot): void {
  installEnvironmentProfileRegistry(new EnvironmentProfileRegistry({
    revision: snapshot.environmentProfile.revision,
    activeProfileId: snapshot.environmentProfile.id,
    profiles: [snapshot.environmentProfile],
  }));
}

export function restoreAwarenessWorkerMap(snapshot: AwarenessWorkerMapSnapshot): TacticalMap {
  const cells: MapCell[] = new Array(snapshot.width * snapshot.height);
  for (let y = 0; y < snapshot.height; y += 1) {
    for (let x = 0; x < snapshot.width; x += 1) {
      const index = y * snapshot.width + x;
      const surfaceMaterialId = snapshot.surfaceMaterialIds[snapshot.surfaceMaterialCodes[index] ?? 0]
        ?? snapshot.defaultSurfaceMaterialId;
      const vegetationMaterialId = snapshot.vegetationMaterialIds[snapshot.vegetationMaterialCodes[index] ?? 0]
        ?? snapshot.defaultVegetationMaterialId;
      cells[index] = {
        x,
        y,
        surfaceMaterialId,
        vegetationMaterialId,
        terrain: surfaceMaterialIdToTerrainKind(surfaceMaterialId),
        height: clampHeight(snapshot.heightLevels[index] ?? 0),
        forest: vegetationMaterialIdToLegacyForestLayer(vegetationMaterialId),
      };
    }
  }

  return {
    width: snapshot.width,
    height: snapshot.height,
    cellSize: snapshot.cellSize,
    metersPerCell: snapshot.metersPerCell,
    sourceToRuntimeCellScale: snapshot.sourceToRuntimeCellScale,
    environmentProfileId: snapshot.environmentProfile.id,
    defaultTerrain: surfaceMaterialIdToTerrainKind(snapshot.defaultSurfaceMaterialId),
    defaultHeight: clampHeight(snapshot.defaultHeight),
    cells,
    objects: snapshot.objects.map((object) => ({
      ...object,
      labels: object.labels ? { ...object.labels } : null,
    })),
  };
}

function clampHeight(value: number): ElevationLevel {
  const rounded = Math.round(value);
  if (rounded <= -2) return -2;
  if (rounded >= 4) return 4;
  return rounded as ElevationLevel;
}
