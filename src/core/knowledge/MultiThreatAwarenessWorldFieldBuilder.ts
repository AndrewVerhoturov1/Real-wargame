import { getDirectionalTerrainSectorBasis } from '../terrain/DirectionalTerrainSectorBasis';
import type { TacticalMap } from '../map/MapModel';
import { getAwarenessStaticField } from './AwarenessStaticField';
import {
  buildAwarenessWorldField,
  digestAwarenessWorldField,
  type AwarenessWorldFieldBuildResult,
} from './AwarenessWorldFieldBuilder';
import { getSoldierDangerField } from './SoldierDangerField';
import type { AwarenessWorkerBuildSnapshot } from './AwarenessWorldWorkerProtocol';
import type { UnitModel } from '../units/UnitModel';

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;
const DANGER_PIXEL_LUT = buildDangerPixelLut();

/**
 * Production awareness-field builder with independent multi-threat aggregation.
 *
 * The legacy danger scorer intentionally collapsed all rifle contacts to one
 * maximum. That made two exposed riflemen look no more dangerous than one. We
 * retain its cached geometry and single-threat scoring, then combine every
 * known source into the published field consumed by the map, Ctrl inspector
 * and tactical-position search.
 */
export function buildMultiThreatAwarenessWorldField(
  map: TacticalMap,
  snapshot: AwarenessWorkerBuildSnapshot,
  reusableUnit: UnitModel | null = null,
): AwarenessWorldFieldBuildResult {
  const startedAt = performance.now();
  const base = buildAwarenessWorldField(map, snapshot, reusableUnit);
  if (snapshot.threats.length <= 1) return base;

  const staticField = getAwarenessStaticField(map, snapshot.posture);
  const directionalBasis = getDirectionalTerrainSectorBasis(map);
  const individualFields = snapshot.threats.map((threat) => getSoldierDangerField(map, {
    unitId: snapshot.unitId,
    posture: snapshot.posture,
    knowledgeRevision: snapshot.knowledgeRevision,
    threats: [threat],
  }, { staticField, directionalBasis }));

  const field = base.field;
  const count = field.width * field.height;
  for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
    const previousDanger = field.danger[cellIndex] ?? 0;
    const previousSuppression = field.suppression[cellIndex] ?? 0;
    const previousUncertainty = field.uncertainty[cellIndex] ?? 0;
    let remainingSafe = 1;
    let remainingUnsuppressed = 1;
    let uncertainty = 0;
    let strongestResidualDanger = -1;
    let protectionAgainstStrongest = 0;
    let strongestThreatIndex = -1;

    for (let threatIndex = 0; threatIndex < individualFields.length; threatIndex += 1) {
      const individual = individualFields[threatIndex]!;
      const danger = individual.danger[cellIndex] ?? 0;
      const suppression = individual.suppression[cellIndex] ?? 0;
      remainingSafe *= 1 - danger / 100;
      remainingUnsuppressed *= 1 - suppression / 100;
      uncertainty = Math.max(uncertainty, individual.uncertainty[cellIndex] ?? 0);
      if (danger > strongestResidualDanger) {
        strongestResidualDanger = danger;
        protectionAgainstStrongest = individual.expectedProtectionAgainstThreat[cellIndex] ?? 0;
        strongestThreatIndex = danger > 0 ? threatIndex : -1;
      }
    }

    const combinedDanger = clampByte(100 * (1 - remainingSafe));
    const combinedSuppression = clampByte(100 * (1 - remainingUnsuppressed));
    field.danger[cellIndex] = combinedDanger;
    field.suppression[cellIndex] = combinedSuppression;
    field.uncertainty[cellIndex] = clampByte(uncertainty);
    field.expectedProtectionAgainstThreat[cellIndex] = clampByte(protectionAgainstStrongest);
    field.protectedThreatIndex[cellIndex] = strongestThreatIndex;
    field.safety[cellIndex] = clampByte(
      (field.safety[cellIndex] ?? 0)
        - Math.max(0, combinedDanger - previousDanger) * 0.45
        - Math.max(0, combinedSuppression - previousSuppression) * 0.16
        - Math.max(0, uncertainty - previousUncertainty) * 0.08,
    );
    field.dangerPixels[cellIndex] = DANGER_PIXEL_LUT[combinedDanger] ?? 0;
  }

  const rasterDigest = digestAwarenessWorldField(field);
  return {
    ...base,
    field,
    computeMs: performance.now() - startedAt,
    fieldIdentity: `${snapshot.canonicalThreatKey}@${rasterDigest}`,
    rasterDigest,
  };
}

function buildDangerPixelLut(): Uint32Array {
  const result = new Uint32Array(101);
  for (let value = 3; value <= 100; value += 1) {
    const [red, green, blue] = value >= 70
      ? [0xe8, 0x3d, 0x32]
      : value >= 40
        ? [0xff, 0x7a, 0x31]
        : [0xf2, 0xc8, 0x4b];
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
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}
