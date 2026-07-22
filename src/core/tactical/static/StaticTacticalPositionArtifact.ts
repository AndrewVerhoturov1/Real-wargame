import {
  STATIC_TACTICAL_POSITION_BASIS_SNAPSHOT_VERSION,
  assertStaticTacticalPositionBasisShape,
  type StaticTacticalPositionBasisSnapshot,
  type StaticTacticalPositionBuildDiagnostics,
} from './StaticTacticalPositionBasis';
import type {
  StaticTacticalCandidateIndexSnapshot,
  StaticTacticalCandidateListSnapshot,
} from './StaticTacticalCandidateIndex';
import {
  STATIC_TACTICAL_POSITION_ALGORITHM_VERSION,
  staticTacticalPositionIdentityKey,
  type StaticTacticalPositionBasisIdentity,
} from './StaticTacticalPositionIdentity';
import {
  STATIC_TACTICAL_POSITION_PERSISTENT_FORMAT_VERSION,
  sameStaticTacticalPositionFingerprint,
  type StaticTacticalPositionFingerprint,
} from './StaticTacticalPositionFingerprint';
import {
  STATIC_TACTICAL_POSITION_SETTINGS_VERSION,
  normalizeStaticTacticalPositionSettings,
  staticTacticalPositionSettingsDigest,
  type StaticTacticalPositionSettings,
} from './StaticTacticalPositionSettings';

export const STATIC_TACTICAL_POSITION_ARTIFACT_VERSION = STATIC_TACTICAL_POSITION_PERSISTENT_FORMAT_VERSION;
export const STATIC_TACTICAL_CANDIDATE_INDEX_VERSION = 1 as const;

export type StaticTacticalArtifactArrayType = 'u8' | 'u16' | 'u32';

export interface StaticTacticalPositionArtifactArrayDescriptor {
  readonly name: string;
  readonly type: StaticTacticalArtifactArrayType;
  readonly length: number;
  readonly byteOffset: number;
  readonly byteLength: number;
}

export interface StaticTacticalPositionArtifactPayload {
  readonly encoding: 'base64';
  readonly byteLength: number;
  readonly checksum: string;
  readonly arrays: readonly StaticTacticalPositionArtifactArrayDescriptor[];
  readonly data: string;
}

export interface StaticTacticalPositionArtifact {
  readonly version: typeof STATIC_TACTICAL_POSITION_ARTIFACT_VERSION;
  readonly fingerprint: StaticTacticalPositionFingerprint;
  readonly algorithmVersion: typeof STATIC_TACTICAL_POSITION_ALGORITHM_VERSION;
  readonly snapshotVersion: typeof STATIC_TACTICAL_POSITION_BASIS_SNAPSHOT_VERSION;
  readonly settingsVersion: typeof STATIC_TACTICAL_POSITION_SETTINGS_VERSION;
  readonly settingsDigest: string;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly metersPerCell: number;
  readonly sectorCount: number;
  readonly settings: StaticTacticalPositionSettings;
  readonly diagnostics: StaticTacticalPositionBuildDiagnostics;
  readonly builtAtMs: number;
  readonly candidateIndex: {
    readonly version: typeof STATIC_TACTICAL_CANDIDATE_INDEX_VERSION;
    readonly width: number;
    readonly height: number;
    readonly sectorCount: number;
    readonly chunkSizeCells: number;
    readonly chunksX: number;
    readonly chunksY: number;
  };
  readonly payload: StaticTacticalPositionArtifactPayload;
}

export type StaticTacticalPositionArtifactRejectReason =
  | 'missing'
  | 'malformed'
  | 'format_version'
  | 'fingerprint'
  | 'algorithm_version'
  | 'snapshot_version'
  | 'settings_version'
  | 'settings_digest'
  | 'dimensions'
  | 'payload_encoding'
  | 'payload_length'
  | 'payload_checksum'
  | 'manifest'
  | 'array_shape'
  | 'candidate_index';

export type StaticTacticalPositionArtifactDecodeResult =
  | {
      readonly ok: true;
      readonly snapshot: StaticTacticalPositionBasisSnapshot;
      readonly fingerprint: StaticTacticalPositionFingerprint;
      readonly decodedBytes: number;
      readonly decodeMs: number;
    }
  | {
      readonly ok: false;
      readonly reason: StaticTacticalPositionArtifactRejectReason;
      readonly message: string;
      readonly decodedBytes: number;
      readonly decodeMs: number;
    };

type SupportedArray = Uint8Array | Uint16Array | Uint32Array;

interface NamedArray {
  readonly name: string;
  readonly type: StaticTacticalArtifactArrayType;
  readonly value: SupportedArray;
}

const BASIS_ARRAYS = [
  'observationPotential',
  'defensePotential',
  'firingPotential',
  'observationByDirection',
  'protectionByDirection',
  'firingByDirection',
  'availablePostureMask',
  'concealment',
  'staticProtectionByPosture',
  'observationByPosture',
  'firingByPosture',
  'surfaceSuitability',
  'reverseSlopeByDirection',
  'immediateFireClearanceByDirection',
] as const;

const CANDIDATE_KINDS = ['observation', 'defense', 'firing'] as const;
const CANDIDATE_ARRAYS = [
  ['chunkOffsets', 'u32'],
  ['chunkCounts', 'u16'],
  ['cellIndices', 'u32'],
  ['scores', 'u8'],
  ['postureMasks', 'u8'],
  ['dominantSectorMasks', 'u32'],
] as const;

export function encodeStaticTacticalPositionArtifact(
  snapshot: StaticTacticalPositionBasisSnapshot,
  fingerprint: StaticTacticalPositionFingerprint,
): StaticTacticalPositionArtifact {
  assertStaticTacticalPositionBasisShape(snapshot);
  assertCandidateIndexShape(snapshot.candidateIndex);
  assertSnapshotMatchesFingerprint(snapshot, fingerprint);
  const namedArrays = collectArrays(snapshot);
  const packed = packArrays(namedArrays);
  return Object.freeze({
    version: STATIC_TACTICAL_POSITION_ARTIFACT_VERSION,
    fingerprint: Object.freeze({ ...fingerprint }),
    algorithmVersion: STATIC_TACTICAL_POSITION_ALGORITHM_VERSION,
    snapshotVersion: STATIC_TACTICAL_POSITION_BASIS_SNAPSHOT_VERSION,
    settingsVersion: STATIC_TACTICAL_POSITION_SETTINGS_VERSION,
    settingsDigest: staticTacticalPositionSettingsDigest(snapshot.settings),
    width: snapshot.width,
    height: snapshot.height,
    cellSize: fingerprint.cellSize,
    metersPerCell: snapshot.metersPerCell,
    sectorCount: snapshot.sectorCount,
    settings: snapshot.settings,
    diagnostics: snapshot.diagnostics,
    builtAtMs: snapshot.builtAtMs,
    candidateIndex: Object.freeze({
      version: STATIC_TACTICAL_CANDIDATE_INDEX_VERSION,
      width: snapshot.candidateIndex.width,
      height: snapshot.candidateIndex.height,
      sectorCount: snapshot.candidateIndex.sectorCount,
      chunkSizeCells: snapshot.candidateIndex.chunkSizeCells,
      chunksX: snapshot.candidateIndex.chunksX,
      chunksY: snapshot.candidateIndex.chunksY,
    }),
    payload: Object.freeze({
      encoding: 'base64',
      byteLength: packed.bytes.length,
      checksum: checksumBytes(packed.bytes),
      arrays: Object.freeze(packed.descriptors.map((entry) => Object.freeze(entry))),
      data: encodeBase64(packed.bytes),
    }),
  });
}

export function decodeStaticTacticalPositionArtifact(
  value: unknown,
  expectedFingerprint: StaticTacticalPositionFingerprint,
  identity: StaticTacticalPositionBasisIdentity,
): StaticTacticalPositionArtifactDecodeResult {
  const startedAt = nowMs();
  let decodedBytes = 0;
  try {
    if (value === null || value === undefined) return rejected('missing', 'Static tactical artifact is absent.', 0, startedAt);
    const artifact = requireRecord(value, 'Artifact must be an object.') as unknown as StaticTacticalPositionArtifact;
    if (artifact.version !== STATIC_TACTICAL_POSITION_ARTIFACT_VERSION) {
      return rejected('format_version', 'Unsupported static tactical artifact format version.', 0, startedAt);
    }
    if (!sameStaticTacticalPositionFingerprint(artifact.fingerprint, expectedFingerprint)) {
      return rejected('fingerprint', 'Persistent fingerprint does not match the runtime-normalized map.', 0, startedAt);
    }
    if (artifact.algorithmVersion !== STATIC_TACTICAL_POSITION_ALGORITHM_VERSION) {
      return rejected('algorithm_version', 'Static tactical algorithm version does not match.', 0, startedAt);
    }
    if (artifact.snapshotVersion !== STATIC_TACTICAL_POSITION_BASIS_SNAPSHOT_VERSION) {
      return rejected('snapshot_version', 'Static tactical snapshot version does not match.', 0, startedAt);
    }
    if (artifact.settingsVersion !== STATIC_TACTICAL_POSITION_SETTINGS_VERSION) {
      return rejected('settings_version', 'Static tactical settings version does not match.', 0, startedAt);
    }
    assertArtifactDimensions(artifact, expectedFingerprint);
    const settings = normalizeStaticTacticalPositionSettings(artifact.settings);
    const settingsDigest = staticTacticalPositionSettingsDigest(settings);
    if (artifact.settingsDigest !== settingsDigest || settingsDigest !== expectedFingerprint.settingsDigest) {
      return rejected('settings_digest', 'Static tactical settings digest does not match.', 0, startedAt);
    }
    const payload = requireRecord(artifact.payload, 'Artifact payload must be an object.') as unknown as StaticTacticalPositionArtifactPayload;
    if (payload.encoding !== 'base64') return rejected('payload_encoding', 'Unsupported artifact payload encoding.', 0, startedAt);
    const bytes = decodeBase64(requireString(payload.data, 'Artifact payload data must be base64 text.'));
    decodedBytes = bytes.length;
    if (!Number.isInteger(payload.byteLength) || payload.byteLength !== bytes.length) {
      return rejected('payload_length', 'Decoded payload byte length does not match the manifest.', decodedBytes, startedAt);
    }
    if (payload.checksum !== checksumBytes(bytes)) {
      return rejected('payload_checksum', 'Decoded payload checksum does not match.', decodedBytes, startedAt);
    }
    const arrays = unpackArrays(bytes, payload.arrays);
    const candidateIndex = hydrateCandidateIndex(artifact.candidateIndex, arrays);
    assertCandidateIndexShape(candidateIndex);
    const diagnostics = normalizeDiagnostics(artifact.diagnostics);
    const snapshot: StaticTacticalPositionBasisSnapshot = Object.freeze({
      version: STATIC_TACTICAL_POSITION_BASIS_SNAPSHOT_VERSION,
      identity,
      identityKey: staticTacticalPositionIdentityKey(identity),
      width: artifact.width,
      height: artifact.height,
      metersPerCell: artifact.metersPerCell,
      sectorCount: artifact.sectorCount,
      observationPotential: requireUint8(arrays, 'observationPotential'),
      defensePotential: requireUint8(arrays, 'defensePotential'),
      firingPotential: requireUint8(arrays, 'firingPotential'),
      observationByDirection: requireUint8(arrays, 'observationByDirection'),
      protectionByDirection: requireUint8(arrays, 'protectionByDirection'),
      firingByDirection: requireUint8(arrays, 'firingByDirection'),
      availablePostureMask: requireUint8(arrays, 'availablePostureMask'),
      concealment: requireUint8(arrays, 'concealment'),
      staticProtectionByPosture: requireUint8(arrays, 'staticProtectionByPosture'),
      observationByPosture: requireUint8(arrays, 'observationByPosture'),
      firingByPosture: requireUint8(arrays, 'firingByPosture'),
      surfaceSuitability: requireUint8(arrays, 'surfaceSuitability'),
      reverseSlopeByDirection: requireUint8(arrays, 'reverseSlopeByDirection'),
      immediateFireClearanceByDirection: requireUint8(arrays, 'immediateFireClearanceByDirection'),
      candidateIndex,
      settings,
      diagnostics,
      builtAtMs: finiteNumber(artifact.builtAtMs, 'builtAtMs'),
    });
    assertStaticTacticalPositionBasisShape(snapshot);
    return {
      ok: true,
      snapshot,
      fingerprint: expectedFingerprint,
      decodedBytes,
      decodeMs: roundMs(nowMs() - startedAt),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = classifyDecodeError(message);
    return rejected(reason, message, decodedBytes, startedAt);
  }
}

export function estimateStaticTacticalPositionArtifactBytes(snapshot: StaticTacticalPositionBasisSnapshot): {
  readonly rawBytes: number;
  readonly base64Bytes: number;
} {
  const rawBytes = collectArrays(snapshot).reduce((sum, entry) => sum + entry.value.byteLength, 0);
  return { rawBytes, base64Bytes: Math.ceil(rawBytes / 3) * 4 };
}

function collectArrays(snapshot: StaticTacticalPositionBasisSnapshot): NamedArray[] {
  const result: NamedArray[] = BASIS_ARRAYS.map((name) => ({ name, type: 'u8', value: snapshot[name] }));
  for (const kind of CANDIDATE_KINDS) {
    const list = snapshot.candidateIndex[kind];
    for (const [field, type] of CANDIDATE_ARRAYS) {
      result.push({ name: `candidateIndex.${kind}.${field}`, type, value: list[field] });
    }
  }
  return result;
}

function packArrays(entries: readonly NamedArray[]): {
  readonly bytes: Uint8Array;
  readonly descriptors: StaticTacticalPositionArtifactArrayDescriptor[];
} {
  const descriptors: StaticTacticalPositionArtifactArrayDescriptor[] = [];
  let offset = 0;
  for (const entry of entries) {
    const alignment = bytesPerElement(entry.type);
    offset = align(offset, alignment);
    descriptors.push({
      name: entry.name,
      type: entry.type,
      length: entry.value.length,
      byteOffset: offset,
      byteLength: entry.value.byteLength,
    });
    offset += entry.value.byteLength;
  }
  const bytes = new Uint8Array(offset);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const descriptor = descriptors[index]!;
    bytes.set(new Uint8Array(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength), descriptor.byteOffset);
  }
  return { bytes, descriptors };
}

function unpackArrays(bytes: Uint8Array, manifest: unknown): Map<string, SupportedArray> {
  if (!Array.isArray(manifest)) throw new Error('manifest: array list is missing.');
  const expectedNames = new Set(collectExpectedArrayNames());
  if (manifest.length !== expectedNames.size) throw new Error('manifest: unexpected array count.');
  const ranges: Array<{ start: number; end: number }> = [];
  const result = new Map<string, SupportedArray>();
  for (const value of manifest) {
    const entry = requireRecord(value, 'manifest: array entry must be an object.');
    const name = requireString(entry.name, 'manifest: array name must be text.');
    const type = requireArrayType(entry.type);
    const length = requireNonNegativeInteger(entry.length, 'manifest: array length');
    const byteOffset = requireNonNegativeInteger(entry.byteOffset, 'manifest: array byteOffset');
    const byteLength = requireNonNegativeInteger(entry.byteLength, 'manifest: array byteLength');
    if (!expectedNames.delete(name) || result.has(name)) throw new Error(`manifest: unexpected or duplicate array ${name}.`);
    if (byteLength !== length * bytesPerElement(type)) throw new Error(`array_shape: byte length mismatch for ${name}.`);
    if (byteOffset % bytesPerElement(type) !== 0) throw new Error(`manifest: unaligned array ${name}.`);
    const end = byteOffset + byteLength;
    if (end > bytes.length) throw new Error(`manifest: array ${name} exceeds payload bounds.`);
    if (ranges.some((range) => byteOffset < range.end && end > range.start)) throw new Error(`manifest: overlapping array ${name}.`);
    ranges.push({ start: byteOffset, end });
    const copied = bytes.slice(byteOffset, end).buffer;
    result.set(name, type === 'u8' ? new Uint8Array(copied) : type === 'u16' ? new Uint16Array(copied) : new Uint32Array(copied));
  }
  if (expectedNames.size > 0) throw new Error('manifest: required arrays are missing.');
  return result;
}

function hydrateCandidateIndex(metadataValue: unknown, arrays: Map<string, SupportedArray>): StaticTacticalCandidateIndexSnapshot {
  const metadata = requireRecord(metadataValue, 'candidate_index: metadata must be an object.');
  if (metadata.version !== STATIC_TACTICAL_CANDIDATE_INDEX_VERSION) throw new Error('candidate_index: version mismatch.');
  return Object.freeze({
    version: STATIC_TACTICAL_CANDIDATE_INDEX_VERSION,
    width: requirePositiveInteger(metadata.width, 'candidate_index: width'),
    height: requirePositiveInteger(metadata.height, 'candidate_index: height'),
    sectorCount: requirePositiveInteger(metadata.sectorCount, 'candidate_index: sectorCount'),
    chunkSizeCells: requirePositiveInteger(metadata.chunkSizeCells, 'candidate_index: chunkSizeCells'),
    chunksX: requirePositiveInteger(metadata.chunksX, 'candidate_index: chunksX'),
    chunksY: requirePositiveInteger(metadata.chunksY, 'candidate_index: chunksY'),
    observation: hydrateCandidateList('observation', arrays),
    defense: hydrateCandidateList('defense', arrays),
    firing: hydrateCandidateList('firing', arrays),
  });
}

function hydrateCandidateList(kind: typeof CANDIDATE_KINDS[number], arrays: Map<string, SupportedArray>): StaticTacticalCandidateListSnapshot {
  return Object.freeze({
    chunkOffsets: requireUint32(arrays, `candidateIndex.${kind}.chunkOffsets`),
    chunkCounts: requireUint16(arrays, `candidateIndex.${kind}.chunkCounts`),
    cellIndices: requireUint32(arrays, `candidateIndex.${kind}.cellIndices`),
    scores: requireUint8(arrays, `candidateIndex.${kind}.scores`),
    postureMasks: requireUint8(arrays, `candidateIndex.${kind}.postureMasks`),
    dominantSectorMasks: requireUint32(arrays, `candidateIndex.${kind}.dominantSectorMasks`),
  });
}

function assertSnapshotMatchesFingerprint(snapshot: StaticTacticalPositionBasisSnapshot, fingerprint: StaticTacticalPositionFingerprint): void {
  if (snapshot.width !== fingerprint.width
    || snapshot.height !== fingerprint.height
    || snapshot.metersPerCell !== fingerprint.metersPerCell
    || snapshot.sectorCount !== fingerprint.sectorCount
    || staticTacticalPositionSettingsDigest(snapshot.settings) !== fingerprint.settingsDigest) {
    throw new Error('Snapshot does not match the supplied persistent fingerprint metadata.');
  }
}

function assertArtifactDimensions(artifact: StaticTacticalPositionArtifact, expected: StaticTacticalPositionFingerprint): void {
  if (artifact.width !== expected.width
    || artifact.height !== expected.height
    || artifact.cellSize !== expected.cellSize
    || artifact.metersPerCell !== expected.metersPerCell
    || artifact.sectorCount !== expected.sectorCount) {
    throw new Error('dimensions: artifact dimensions or scale do not match the runtime map.');
  }
}

function assertCandidateIndexShape(index: StaticTacticalCandidateIndexSnapshot): void {
  if (index.version !== STATIC_TACTICAL_CANDIDATE_INDEX_VERSION) throw new Error('candidate_index: version mismatch.');
  if (index.chunksX !== Math.ceil(index.width / index.chunkSizeCells)
    || index.chunksY !== Math.ceil(index.height / index.chunkSizeCells)) {
    throw new Error('candidate_index: chunk dimensions are inconsistent.');
  }
  const chunkCount = index.chunksX * index.chunksY;
  const cellCount = index.width * index.height;
  for (const kind of CANDIDATE_KINDS) assertCandidateListShape(index[kind], chunkCount, cellCount, kind);
}

function assertCandidateListShape(list: StaticTacticalCandidateListSnapshot, chunkCount: number, cellCount: number, kind: string): void {
  if (list.chunkOffsets.length !== chunkCount || list.chunkCounts.length !== chunkCount) {
    throw new Error(`candidate_index: ${kind} chunk array length mismatch.`);
  }
  const candidateCount = list.cellIndices.length;
  if (list.scores.length !== candidateCount
    || list.postureMasks.length !== candidateCount
    || list.dominantSectorMasks.length !== candidateCount) {
    throw new Error(`candidate_index: ${kind} candidate array length mismatch.`);
  }
  let offset = 0;
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    if (list.chunkOffsets[chunk] !== offset) throw new Error(`candidate_index: ${kind} chunk offsets are inconsistent.`);
    offset += list.chunkCounts[chunk] ?? 0;
    if (offset > candidateCount) throw new Error(`candidate_index: ${kind} chunk counts exceed candidates.`);
  }
  if (offset !== candidateCount) throw new Error(`candidate_index: ${kind} candidate count is inconsistent.`);
  for (const cellIndex of list.cellIndices) {
    if (cellIndex >= cellCount) throw new Error(`candidate_index: ${kind} contains an out-of-map cell.`);
  }
}

function normalizeDiagnostics(value: unknown): StaticTacticalPositionBuildDiagnostics {
  const record = requireRecord(value, 'diagnostics must be an object.');
  return Object.freeze({
    buildMs: nonNegativeNumber(record.buildMs, 'buildMs'),
    cellsProcessed: nonNegativeInteger(record.cellsProcessed, 'cellsProcessed'),
    observationRays: nonNegativeInteger(record.observationRays, 'observationRays'),
    firingRays: nonNegativeInteger(record.firingRays, 'firingRays'),
    blockedCells: nonNegativeInteger(record.blockedCells, 'blockedCells'),
    observationCandidates: nonNegativeInteger(record.observationCandidates, 'observationCandidates'),
    defenseCandidates: nonNegativeInteger(record.defenseCandidates, 'defenseCandidates'),
    firingCandidates: nonNegativeInteger(record.firingCandidates, 'firingCandidates'),
  });
}

function collectExpectedArrayNames(): string[] {
  const names: string[] = [...BASIS_ARRAYS];
  for (const kind of CANDIDATE_KINDS) {
    for (const [field] of CANDIDATE_ARRAYS) names.push(`candidateIndex.${kind}.${field}`);
  }
  return names;
}

function requireUint8(arrays: Map<string, SupportedArray>, name: string): Uint8Array {
  const value = arrays.get(name);
  if (!(value instanceof Uint8Array)) throw new Error(`array_shape: ${name} must be Uint8Array.`);
  return value;
}

function requireUint16(arrays: Map<string, SupportedArray>, name: string): Uint16Array {
  const value = arrays.get(name);
  if (!(value instanceof Uint16Array)) throw new Error(`array_shape: ${name} must be Uint16Array.`);
  return value;
}

function requireUint32(arrays: Map<string, SupportedArray>, name: string): Uint32Array {
  const value = arrays.get(name);
  if (!(value instanceof Uint32Array)) throw new Error(`array_shape: ${name} must be Uint32Array.`);
  return value;
}

function bytesPerElement(type: StaticTacticalArtifactArrayType): number {
  return type === 'u8' ? 1 : type === 'u16' ? 2 : 4;
}

function requireArrayType(value: unknown): StaticTacticalArtifactArrayType {
  if (value === 'u8' || value === 'u16' || value === 'u32') return value;
  throw new Error('manifest: unsupported array type.');
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const chunks: string[] = [];
  let chunk = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const remaining = bytes.length - index;
    chunk += alphabet[a >> 2];
    chunk += alphabet[((a & 3) << 4) | (b >> 4)];
    chunk += remaining > 1 ? alphabet[((b & 15) << 2) | (c >> 6)] : '=';
    chunk += remaining > 2 ? alphabet[c & 63] : '=';
    if (chunk.length >= 32768) { chunks.push(chunk); chunk = ''; }
  }
  if (chunk) chunks.push(chunk);
  return chunks.join('');
}

function decodeBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
    throw new Error('payload_encoding: invalid base64 data.');
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const reverse = new Int16Array(128);
  reverse.fill(-1);
  for (let index = 0; index < alphabet.length; index += 1) reverse[alphabet.charCodeAt(index)] = index;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const result = new Uint8Array(text.length / 4 * 3 - padding);
  let output = 0;
  for (let index = 0; index < text.length; index += 4) {
    const a = reverse[text.charCodeAt(index)]!;
    const b = reverse[text.charCodeAt(index + 1)]!;
    const c = text[index + 2] === '=' ? 0 : reverse[text.charCodeAt(index + 2)]!;
    const d = text[index + 3] === '=' ? 0 : reverse[text.charCodeAt(index + 3)]!;
    result[output++] = (a << 2) | (b >> 4);
    if (output < result.length) result[output++] = ((b & 15) << 4) | (c >> 2);
    if (output < result.length) result[output++] = ((c & 3) << 6) | d;
  }
  return result;
}

function checksumBytes(bytes: Uint8Array): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const byte of bytes) {
    left = Math.imul(left ^ byte, 0x01000193) >>> 0;
    right = Math.imul(right ^ (byte + 0x9d), 0x85ebca6b) >>> 0;
  }
  return `stpc-${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`;
}

function classifyDecodeError(message: string): StaticTacticalPositionArtifactRejectReason {
  if (message.startsWith('dimensions:')) return 'dimensions';
  if (message.startsWith('payload_encoding:')) return 'payload_encoding';
  if (message.startsWith('manifest:')) return 'manifest';
  if (message.startsWith('array_shape:')) return 'array_shape';
  if (message.startsWith('candidate_index:')) return 'candidate_index';
  return 'malformed';
}

function rejected(reason: StaticTacticalPositionArtifactRejectReason, message: string, decodedBytes: number, startedAt: number): StaticTacticalPositionArtifactDecodeResult {
  return { ok: false, reason, message, decodedBytes, decodeMs: roundMs(nowMs() - startedAt) };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message);
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer.`);
  return value as number;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value as number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  return requireNonNegativeInteger(value, label);
}

function nonNegativeNumber(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function align(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
