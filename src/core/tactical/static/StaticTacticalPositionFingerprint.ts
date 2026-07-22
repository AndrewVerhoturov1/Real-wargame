import {
  ENVIRONMENT_PROFILE_FORMAT_VERSION,
  type EnvironmentMaterialProfile,
} from '../../map/EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from '../../map/EnvironmentProfileRuntime';
import {
  resolveObjectCoverProperties,
  type MapObject,
  type TacticalMap,
} from '../../map/MapModel';
import { getMapObjectHeightMetres } from '../../map/MapObjectGeometry';
import { STATIC_TACTICAL_POSITION_BASIS_SNAPSHOT_VERSION } from './StaticTacticalPositionBasis';
import { STATIC_TACTICAL_POSITION_ALGORITHM_VERSION } from './StaticTacticalPositionIdentity';
import {
  STATIC_TACTICAL_POSITION_SETTINGS_VERSION,
  staticTacticalPositionSettingsDigest,
  type StaticTacticalPositionSettings,
} from './StaticTacticalPositionSettings';

export const STATIC_TACTICAL_POSITION_PERSISTENT_FORMAT_VERSION = 1 as const;
export const STATIC_TACTICAL_POSITION_OBJECT_GEOMETRY_SEMANTICS_VERSION = 1 as const;
export const STATIC_TACTICAL_POSITION_FINGERPRINT_VERSION = 1 as const;

export interface StaticTacticalPositionFingerprint {
  readonly version: typeof STATIC_TACTICAL_POSITION_FINGERPRINT_VERSION;
  readonly value: string;
  readonly settingsDigest: string;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly metersPerCell: number;
  readonly sectorCount: number;
}

interface CanonicalObjectRecord {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly rotationRadians: number;
  readonly widthCells: number;
  readonly heightCells: number;
  readonly losHeightMetres: number;
  readonly coverProtection: number;
  readonly coverReliability: number;
  readonly concealment: number;
  readonly penetrable: boolean;
  readonly coverPosture: string;
}

/** Cross-session identity of the runtime-normalized static physical map. */
export function createStaticTacticalPositionFingerprint(
  map: TacticalMap,
  settings: StaticTacticalPositionSettings,
  profile: EnvironmentMaterialProfile = getActiveEnvironmentProfile(),
): StaticTacticalPositionFingerprint {
  const settingsDigest = staticTacticalPositionSettingsDigest(settings);
  const writer = new FingerprintWriter();
  writer.string('real-wargame/static-tactical-position');
  writer.uint32(STATIC_TACTICAL_POSITION_PERSISTENT_FORMAT_VERSION);
  writer.uint32(STATIC_TACTICAL_POSITION_FINGERPRINT_VERSION);
  writer.uint32(STATIC_TACTICAL_POSITION_ALGORITHM_VERSION);
  writer.uint32(STATIC_TACTICAL_POSITION_BASIS_SNAPSHOT_VERSION);
  writer.uint32(STATIC_TACTICAL_POSITION_SETTINGS_VERSION);
  writer.uint32(STATIC_TACTICAL_POSITION_OBJECT_GEOMETRY_SEMANTICS_VERSION);
  writer.uint32(ENVIRONMENT_PROFILE_FORMAT_VERSION);
  writer.string(settingsDigest);
  writeCanonicalValue(writer, settings);

  writer.uint32(map.width);
  writer.uint32(map.height);
  writer.float64(map.cellSize);
  writer.float64(map.metersPerCell);
  writer.uint32(settings.sectors.count);
  writer.string(map.environmentProfileId);

  writer.uint32(map.cells.length);
  for (let index = 0; index < map.cells.length; index += 1) {
    const cell = map.cells[index]!;
    writer.uint32(index);
    writer.int32(cell.x);
    writer.int32(cell.y);
    writer.int32(cell.height);
    writer.string(cell.terrain);
    writer.int32(cell.forest);
    writer.string(cell.surfaceMaterialId);
    writer.string(cell.vegetationMaterialId);
  }

  const objects = map.objects.map(canonicalObjectRecord).sort(compareCanonicalObjects);
  writer.uint32(objects.length);
  for (const object of objects) writeCanonicalValue(writer, object);

  writePhysicalEnvironmentProfile(writer, profile);

  return Object.freeze({
    version: STATIC_TACTICAL_POSITION_FINGERPRINT_VERSION,
    value: `stpf${STATIC_TACTICAL_POSITION_FINGERPRINT_VERSION}-${writer.hex()}`,
    settingsDigest,
    width: map.width,
    height: map.height,
    cellSize: map.cellSize,
    metersPerCell: map.metersPerCell,
    sectorCount: settings.sectors.count,
  });
}

export function sameStaticTacticalPositionFingerprint(
  left: Pick<StaticTacticalPositionFingerprint, 'version' | 'value'> | null | undefined,
  right: Pick<StaticTacticalPositionFingerprint, 'version' | 'value'> | null | undefined,
): boolean {
  return left === right || Boolean(left && right && left.version === right.version && left.value === right.value);
}

function canonicalObjectRecord(object: MapObject): CanonicalObjectRecord {
  const cover = resolveObjectCoverProperties(object);
  return {
    kind: object.kind,
    x: finite(object.x),
    y: finite(object.y),
    rotationRadians: normalizeRadians(object.rotationRadians),
    widthCells: finite(object.widthCells),
    heightCells: finite(object.heightCells),
    losHeightMetres: getMapObjectHeightMetres(object),
    coverProtection: finite(cover.coverProtection),
    coverReliability: finite(cover.coverReliability),
    concealment: finite(cover.concealment),
    penetrable: cover.penetrable,
    coverPosture: cover.coverPosture,
  };
}

function compareCanonicalObjects(left: CanonicalObjectRecord, right: CanonicalObjectRecord): number {
  return compareText(left.kind, right.kind)
    || compareNumber(left.x, right.x)
    || compareNumber(left.y, right.y)
    || compareNumber(left.rotationRadians, right.rotationRadians)
    || compareNumber(left.widthCells, right.widthCells)
    || compareNumber(left.heightCells, right.heightCells)
    || compareNumber(left.losHeightMetres, right.losHeightMetres)
    || compareNumber(left.coverProtection, right.coverProtection)
    || compareNumber(left.coverReliability, right.coverReliability)
    || compareNumber(left.concealment, right.concealment)
    || Number(left.penetrable) - Number(right.penetrable)
    || compareText(left.coverPosture, right.coverPosture);
}

function writePhysicalEnvironmentProfile(writer: FingerprintWriter, profile: EnvironmentMaterialProfile): void {
  writer.string(profile.id);
  const surfaceIds = Object.keys(profile.surfaces).sort(compareText);
  writer.uint32(surfaceIds.length);
  for (const id of surfaceIds) {
    const material = profile.surfaces[id]!;
    writer.string(id);
    writeCanonicalValue(writer, material.movement);
  }
  const vegetationIds = Object.keys(profile.vegetation).sort(compareText);
  writer.uint32(vegetationIds.length);
  for (const id of vegetationIds) {
    const material = profile.vegetation[id]!;
    writer.string(id);
    writer.int32(material.legacyLayer ?? -1);
    writeCanonicalValue(writer, material.visibility);
    writeCanonicalValue(writer, material.fire);
    writeCanonicalValue(writer, material.movement);
  }
}

function writeCanonicalValue(writer: FingerprintWriter, value: unknown): void {
  if (value === null) { writer.byte(0); return; }
  if (value === undefined) { writer.byte(1); return; }
  if (typeof value === 'boolean') { writer.byte(value ? 3 : 2); return; }
  if (typeof value === 'number') { writer.byte(4); writer.float64(value); return; }
  if (typeof value === 'string') { writer.byte(5); writer.string(value); return; }
  if (Array.isArray(value)) {
    writer.byte(6);
    writer.uint32(value.length);
    for (const child of value) writeCanonicalValue(writer, child);
    return;
  }
  if (typeof value === 'object') {
    writer.byte(7);
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right));
    writer.uint32(entries.length);
    for (const [key, child] of entries) {
      writer.string(key);
      writeCanonicalValue(writer, child);
    }
    return;
  }
  throw new Error(`Unsupported persistent fingerprint value: ${typeof value}`);
}

class FingerprintWriter {
  private left = 0x811c9dc5;
  private right = 0x9e3779b9;
  private readonly scratch = new DataView(new ArrayBuffer(8));
  private readonly encodedStrings = new Map<string, Uint8Array>();

  byte(value: number): void {
    const byte = value & 0xff;
    this.left = Math.imul(this.left ^ byte, 0x01000193) >>> 0;
    this.right = Math.imul(this.right ^ (byte + 0x9d), 0x85ebca6b) >>> 0;
  }

  uint32(value: number): void {
    this.scratch.setUint32(0, Math.max(0, Math.floor(finite(value))), true);
    this.bytes(new Uint8Array(this.scratch.buffer, 0, 4));
  }

  int32(value: number): void {
    this.scratch.setInt32(0, Math.trunc(finite(value)), true);
    this.bytes(new Uint8Array(this.scratch.buffer, 0, 4));
  }

  float64(value: number): void {
    const normalized = Object.is(value, -0) ? 0 : finite(value);
    this.scratch.setFloat64(0, normalized, true);
    this.bytes(new Uint8Array(this.scratch.buffer, 0, 8));
  }

  string(value: string): void {
    let encoded = this.encodedStrings.get(value);
    if (!encoded) {
      encoded = new TextEncoder().encode(value);
      this.encodedStrings.set(value, encoded);
    }
    this.uint32(encoded.length);
    this.bytes(encoded);
  }

  bytes(values: Uint8Array): void {
    for (let index = 0; index < values.length; index += 1) this.byte(values[index]!);
  }

  hex(): string {
    return `${this.left.toString(16).padStart(8, '0')}${this.right.toString(16).padStart(8, '0')}`;
  }
}

function normalizeRadians(value: number): number {
  const tau = Math.PI * 2;
  const normalized = ((finite(value) % tau) + tau) % tau;
  return Math.abs(normalized - tau) < 1e-12 ? 0 : normalized;
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Persistent fingerprint input contains a non-finite number.');
  return value;
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
