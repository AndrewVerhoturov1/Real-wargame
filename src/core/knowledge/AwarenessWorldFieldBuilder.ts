import { getThreatRelativeCoverFieldDiagnostics } from '../cover/ThreatRelativeCoverField';
import type { TacticalMap } from '../map/MapModel';
import type { SimulationState } from '../simulation/SimulationState';
import { getDirectionalTacticalFieldDiagnostics } from '../terrain/DirectionalTacticalField';
import { getDirectionalTerrainSectorBasisDiagnostics } from '../terrain/DirectionalTerrainSectorBasis';
import type { UnitModel } from '../units/UnitModel';
import { getAwarenessDynamicRescoreDiagnostics } from './AwarenessDynamicRescore';
import { buildSoldierAwarenessReport } from './SoldierAwarenessGrid';
import { buildCanonicalWorldThreatKey } from './CanonicalWorldThreat';
import type {
  AwarenessWorkerBuildSnapshot,
  AwarenessWorkerComputationDelta,
  AwarenessWorkerFieldPayload,
} from './AwarenessWorldWorkerProtocol';

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;
const DANGER_PIXEL_LUT = buildPixelLut('danger');
const STEALTH_PIXEL_LUT = buildPixelLut('stealth');

export interface AwarenessWorldFieldBuildResult {
  readonly reusableUnit: UnitModel;
  readonly field: AwarenessWorkerFieldPayload;
  readonly computation: AwarenessWorkerComputationDelta;
  readonly computeMs: number;
  readonly fieldIdentity: string;
  readonly rasterDigest: string;
}

/** Exact full-map implementation used by both the production worker and semantic tests. */
export function buildAwarenessWorldField(
  map: TacticalMap,
  snapshot: AwarenessWorkerBuildSnapshot,
  reusableUnit: UnitModel | null = null,
): AwarenessWorldFieldBuildResult {
  const actualCanonicalKey = buildCanonicalWorldThreatKey(snapshot.threats);
  if (actualCanonicalKey !== snapshot.canonicalThreatKey) {
    throw new Error(`Canonical threat key mismatch: requested=${snapshot.canonicalThreatKey}, payload=${actualCanonicalKey}`);
  }

  const startedAt = performance.now();
  const unit = prepareUnit(snapshot, reusableUnit);
  const state = { map, units: [unit] } as unknown as SimulationState;
  const beforeCover = getThreatRelativeCoverFieldDiagnostics(map);
  const beforeDirectional = getDirectionalTacticalFieldDiagnostics(map);
  const beforeBasis = getDirectionalTerrainSectorBasisDiagnostics(map);
  const beforeRescore = getAwarenessDynamicRescoreDiagnostics(unit);
  const report = buildSoldierAwarenessReport(state, unit);
  const afterCover = getThreatRelativeCoverFieldDiagnostics(map);
  const afterDirectional = getDirectionalTacticalFieldDiagnostics(map);
  const afterBasis = getDirectionalTerrainSectorBasisDiagnostics(map);
  const afterRescore = getAwarenessDynamicRescoreDiagnostics(unit);
  const threatIds = snapshot.threats.map((threat) => threat.id);
  const threatIndexById = new Map(threatIds.map((id, index) => [id, index]));
  const count = map.width * map.height;
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

  const field: AwarenessWorkerFieldPayload = {
    width: map.width,
    height: map.height,
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
  };
  const rasterDigest = digestAwarenessWorldField(field);

  return {
    reusableUnit: unit,
    field,
    computation: {
      threatRelativeGeometryBuilds: afterCover.geometryBuildCount - beforeCover.geometryBuildCount,
      directionalFieldBuilds: afterDirectional.buildCount - beforeDirectional.buildCount,
      directionalBasisBuilds: afterBasis.buildCount - beforeBasis.buildCount,
      awarenessGeometryBuilds: afterRescore.geometryBuildCount - beforeRescore.geometryBuildCount,
      awarenessRescores: afterRescore.dynamicRescoreCount - beforeRescore.dynamicRescoreCount,
    },
    computeMs: performance.now() - startedAt,
    fieldIdentity: `${snapshot.canonicalThreatKey}@${rasterDigest}`,
    rasterDigest,
  };
}

export function digestAwarenessWorldField(field: AwarenessWorkerFieldPayload): string {
  let hash = 0x811c9dc5;
  hash = hashTypedArray(hash, field.danger);
  hash = hashTypedArray(hash, field.safety);
  hash = hashTypedArray(hash, field.dangerPixels);
  hash = hashTypedArray(hash, field.protectedThreatIndex);
  return hash.toString(16).padStart(8, '0');
}

function prepareUnit(snapshot: AwarenessWorkerBuildSnapshot, reusableUnit: UnitModel | null): UnitModel {
  const order = snapshot.orderTarget ? { target: { ...snapshot.orderTarget } } : null;
  if (!reusableUnit) {
    return {
      id: snapshot.unitId,
      position: { ...snapshot.compatibilityOrigin },
      order,
      behaviorRuntime: { posture: snapshot.posture },
      tacticalKnowledge: {
        threats: snapshot.threats.map((threat) => ({ ...threat })),
        revision: snapshot.knowledgeRevision,
        lastUpdatedSeconds: 0,
      },
    } as unknown as UnitModel;
  }

  reusableUnit.id = snapshot.unitId;
  reusableUnit.position.x = snapshot.compatibilityOrigin.x;
  reusableUnit.position.y = snapshot.compatibilityOrigin.y;
  reusableUnit.order = order as UnitModel['order'];
  reusableUnit.behaviorRuntime.posture = snapshot.posture;
  reusableUnit.tacticalKnowledge.threats = snapshot.threats.map((threat) => ({ ...threat }));
  reusableUnit.tacticalKnowledge.revision = snapshot.knowledgeRevision;
  return reusableUnit;
}

function hashTypedArray(hash: number, value: ArrayBufferView): number {
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let next = hash >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    next ^= bytes[index] ?? 0;
    next = Math.imul(next, 0x01000193) >>> 0;
  }
  return next;
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
