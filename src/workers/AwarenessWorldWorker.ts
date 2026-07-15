import { getThreatRelativeCoverFieldDiagnostics } from '../core/cover/ThreatRelativeCoverField';
import {
  awarenessWorkerTransferables,
  type AwarenessWorkerRequest,
  type AwarenessWorkerResponse,
} from '../core/knowledge/AwarenessWorldWorkerProtocol';
import { getAwarenessDynamicRescoreDiagnostics } from '../core/knowledge/AwarenessDynamicRescore';
import { buildSoldierAwarenessReport } from '../core/knowledge/SoldierAwarenessGrid';
import type {
  ElevationLevel,
  ForestLayerKind,
  MapCell,
  TacticalMap,
  TerrainKind,
} from '../core/map/MapModel';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getDirectionalTacticalFieldDiagnostics } from '../core/terrain/DirectionalTacticalField';
import { getDirectionalTerrainSectorBasisDiagnostics } from '../core/terrain/DirectionalTerrainSectorBasis';
import type { UnitModel } from '../core/units/UnitModel';

const TERRAIN_KINDS: readonly TerrainKind[] = ['field', 'forest', 'road', 'swamp', 'rough', 'water'];
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;
const DANGER_PIXEL_LUT = buildPixelLut('danger');
const STEALTH_PIXEL_LUT = buildPixelLut('stealth');

type WorkerGlobal = {
  onmessage: ((event: MessageEvent<AwarenessWorkerRequest>) => void) | null;
  postMessage(message: AwarenessWorkerResponse, transfer?: Transferable[]): void;
};

const workerGlobal = globalThis as unknown as WorkerGlobal;
let configuredMap: TacticalMap | null = null;
let configuredMapKey = '';
let workerUnit: UnitModel | null = null;

workerGlobal.onmessage = (event): void => {
  const request = event.data;
  if (request.type === 'configure') {
    configuredMap = restoreMap(request.map);
    configuredMapKey = request.map.mapKey;
    workerUnit = null;
    return;
  }

  const snapshot = request.snapshot;
  try {
    if (!configuredMap || configuredMapKey !== snapshot.mapKey) {
      throw new Error(`Awareness worker map mismatch: configured=${configuredMapKey || 'none'}, requested=${snapshot.mapKey}`);
    }
    const startedAt = performance.now();
    const unit = prepareUnit(snapshot);
    const state = { map: configuredMap, units: [unit] } as unknown as SimulationState;
    const beforeCover = getThreatRelativeCoverFieldDiagnostics(configuredMap);
    const beforeDirectional = getDirectionalTacticalFieldDiagnostics(configuredMap);
    const beforeBasis = getDirectionalTerrainSectorBasisDiagnostics(configuredMap);
    const beforeRescore = getAwarenessDynamicRescoreDiagnostics(unit);
    const report = buildSoldierAwarenessReport(state, unit);
    const afterCover = getThreatRelativeCoverFieldDiagnostics(configuredMap);
    const afterDirectional = getDirectionalTacticalFieldDiagnostics(configuredMap);
    const afterBasis = getDirectionalTerrainSectorBasisDiagnostics(configuredMap);
    const afterRescore = getAwarenessDynamicRescoreDiagnostics(unit);
    const threatIds = snapshot.threats.map((threat) => threat.id);
    const threatIndexById = new Map(threatIds.map((id, index) => [id, index]));
    const count = configuredMap.width * configuredMap.height;
    const danger = new Uint8Array(count);
    const concealment = new Uint8Array(count);
    const safety = new Uint8Array(count);
    const expectedProtection = new Uint8Array(count);
    const expectedProtectionAgainstThreat = new Uint8Array(count);
    const protectedThreatIndex = new Int16Array(count);
    protectedThreatIndex.fill(-1);
    const dangerPixels = new Uint32Array(count);
    const stealthPixels = new Uint32Array(count);

    for (let index = 0; index < count; index += 1) {
      const cell = report.cells[index];
      if (!cell) continue;
      danger[index] = clampByte(cell.danger);
      concealment[index] = clampByte(cell.concealment);
      safety[index] = clampByte(cell.safety);
      expectedProtection[index] = clampByte(cell.expectedProtection);
      expectedProtectionAgainstThreat[index] = clampByte(cell.expectedProtectionAgainstThreat);
      protectedThreatIndex[index] = cell.protectedAgainstThreatId === null
        ? -1
        : threatIndexById.get(cell.protectedAgainstThreatId) ?? -1;
      dangerPixels[index] = DANGER_PIXEL_LUT[danger[index]] ?? 0;
      stealthPixels[index] = STEALTH_PIXEL_LUT[concealment[index]] ?? 0;
    }

    const response: Extract<AwarenessWorkerResponse, { type: 'result' }> = {
      type: 'result',
      jobId: snapshot.jobId,
      rasterKey: snapshot.rasterKey,
      mapKey: snapshot.mapKey,
      finalExact: snapshot.finalExact,
      computeMs: performance.now() - startedAt,
      field: {
        width: configuredMap.width,
        height: configuredMap.height,
        danger,
        concealment,
        safety,
        expectedProtection,
        expectedProtectionAgainstThreat,
        protectedThreatIndex,
        dangerPixels,
        stealthPixels,
        threatIds,
        threatConfidence: report.threatConfidence,
      },
      computation: {
        threatRelativeGeometryBuilds: afterCover.geometryBuildCount - beforeCover.geometryBuildCount,
        directionalFieldBuilds: afterDirectional.buildCount - beforeDirectional.buildCount,
        directionalBasisBuilds: afterBasis.buildCount - beforeBasis.buildCount,
        awarenessGeometryBuilds: afterRescore.geometryBuildCount - beforeRescore.geometryBuildCount,
        awarenessRescores: afterRescore.dynamicRescoreCount - beforeRescore.dynamicRescoreCount,
      },
    };
    workerGlobal.postMessage(response, awarenessWorkerTransferables(response));
  } catch (error) {
    workerGlobal.postMessage({
      type: 'error',
      jobId: snapshot.jobId,
      rasterKey: snapshot.rasterKey,
      mapKey: snapshot.mapKey,
      message: error instanceof Error ? `${error.message}\n${error.stack ?? ''}`.trim() : String(error),
    });
  }
};

function prepareUnit(snapshot: Extract<AwarenessWorkerRequest, { type: 'build' }>['snapshot']): UnitModel {
  const order = snapshot.orderTarget ? { target: { ...snapshot.orderTarget } } : null;
  if (!workerUnit) {
    workerUnit = {
      id: snapshot.unitId,
      position: { ...snapshot.stableWorldOrigin },
      order,
      behaviorRuntime: { posture: snapshot.posture },
      tacticalKnowledge: {
        threats: snapshot.threats.map((threat) => ({ ...threat })),
        revision: snapshot.knowledgeRevision,
        lastUpdatedSeconds: 0,
      },
    } as unknown as UnitModel;
    return workerUnit;
  }

  workerUnit.id = snapshot.unitId;
  workerUnit.position.x = snapshot.stableWorldOrigin.x;
  workerUnit.position.y = snapshot.stableWorldOrigin.y;
  workerUnit.order = order as UnitModel['order'];
  workerUnit.behaviorRuntime.posture = snapshot.posture;
  workerUnit.tacticalKnowledge.threats = snapshot.threats.map((threat) => ({ ...threat }));
  workerUnit.tacticalKnowledge.revision = snapshot.knowledgeRevision;
  return workerUnit;
}

function restoreMap(snapshot: Extract<AwarenessWorkerRequest, { type: 'configure' }>['map']): TacticalMap {
  const cells: MapCell[] = new Array(snapshot.width * snapshot.height);
  for (let y = 0; y < snapshot.height; y += 1) {
    for (let x = 0; x < snapshot.width; x += 1) {
      const index = y * snapshot.width + x;
      cells[index] = {
        x,
        y,
        terrain: TERRAIN_KINDS[snapshot.terrainCodes[index] ?? 0] ?? 'field',
        height: clampHeight(snapshot.heightLevels[index] ?? 0),
        forest: clampForest(snapshot.forestKinds[index] ?? 0),
      };
    }
  }
  return {
    width: snapshot.width,
    height: snapshot.height,
    cellSize: snapshot.cellSize,
    metersPerCell: snapshot.metersPerCell,
    sourceToRuntimeCellScale: snapshot.sourceToRuntimeCellScale,
    defaultTerrain: TERRAIN_KINDS[snapshot.defaultTerrainCode] ?? 'field',
    defaultHeight: clampHeight(snapshot.defaultHeight),
    cells,
    objects: snapshot.objects.map((object) => ({
      ...object,
      labels: object.labels ? { ...object.labels } : null,
    })),
  };
}

function buildPixelLut(mode: 'danger' | 'stealth'): Uint32Array {
  const result = new Uint32Array(101);
  for (let value = 0; value <= 100; value += 1) {
    if (value <= 2) continue;
    let red: number;
    let green: number;
    let blue: number;
    if (mode === 'danger') {
      if (value >= 70) {
        red = 0xe8;
        green = 0x3d;
        blue = 0x32;
      } else if (value >= 40) {
        red = 0xff;
        green = 0x7a;
        blue = 0x31;
      } else {
        red = 0xf2;
        green = 0xc8;
        blue = 0x4b;
      }
    } else if (value >= 75) {
      red = 0x1c;
      green = 0x6b;
      blue = 0x45;
    } else if (value >= 50) {
      red = 0x3d;
      green = 0xa8;
      blue = 0x5f;
    } else if (value >= 25) {
      red = 0xd7;
      green = 0xb9;
      blue = 0x4b;
    } else {
      red = 0xd9;
      green = 0x77;
      blue = 0x32;
    }
    const alpha = Math.round(Math.min(0.55, 0.08 + value / 100 * 0.46) * 255);
    result[value] = packRgba(red, green, blue, alpha);
  }
  return result;
}

function packRgba(red: number, green: number, blue: number, alpha: number): number {
  return LITTLE_ENDIAN
    ? (red | green << 8 | blue << 16 | alpha << 24) >>> 0
    : (red << 24 | green << 16 | blue << 8 | alpha) >>> 0;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampHeight(value: number): ElevationLevel {
  const rounded = Math.round(value);
  if (rounded <= -2) return -2;
  if (rounded >= 4) return 4;
  return rounded as ElevationLevel;
}

function clampForest(value: number): ForestLayerKind {
  if (value <= 0) return 0;
  if (value >= 2) return 2;
  return 1;
}
