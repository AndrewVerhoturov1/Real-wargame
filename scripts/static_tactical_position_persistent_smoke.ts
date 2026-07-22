import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getActiveEnvironmentProfile } from '../src/core/map/EnvironmentProfileRuntime';
import { markMapObjectsDirty } from '../src/core/map/MapRuntimeState';
import { normalizeMap, type TacticalMap, type TacticalMapData } from '../src/core/map/MapModel';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import { createResolutionAwareInitialState, replaceSceneAtRuntimeResolution } from '../src/core/simulation/ResolutionAwareScene';
import {
  decodeStaticTacticalPositionArtifact,
  encodeStaticTacticalPositionArtifact,
  estimateStaticTacticalPositionArtifactBytes,
  type StaticTacticalPositionArtifact,
} from '../src/core/tactical/static/StaticTacticalPositionArtifact';
import { buildHighQualityStaticTacticalPositionBasis } from '../src/core/tactical/static/HighQualityStaticTacticalPositionBuilder';
import {
  createStaticTacticalPositionBasisArrays,
  type StaticTacticalPositionBasisSnapshot,
} from '../src/core/tactical/static/StaticTacticalPositionBasis';
import { createEmptyStaticTacticalCandidateIndex } from '../src/core/tactical/static/StaticTacticalCandidateIndex';
import { createStaticTacticalPositionFingerprint } from '../src/core/tactical/static/StaticTacticalPositionFingerprint';
import {
  createStaticTacticalPositionBasisIdentity,
  staticTacticalPositionIdentityKey,
} from '../src/core/tactical/static/StaticTacticalPositionIdentity';
import { StaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';
import { createDefaultStaticTacticalPositionSettings } from '../src/core/tactical/static/StaticTacticalPositionSettings';
import { normalizeImportedScene } from '../src/ui/SceneExport';

const settings = createDefaultStaticTacticalPositionSettings();
const profile = getActiveEnvironmentProfile();
const map = testMap();
const identity = createStaticTacticalPositionBasisIdentity(map, settings);
const snapshot = buildHighQualityStaticTacticalPositionBasis(map, identity, settings).snapshot;
const fingerprint = createStaticTacticalPositionFingerprint(map, settings, profile);
const artifact = encodeStaticTacticalPositionArtifact(snapshot, fingerprint);

verifyRoundTrip();
verifyOldSceneCompatibility();
verifyFingerprintStabilityAndInvalidation();
verifyArtifactRejections();
verifyRejectedArtifactsDoNotChangeActiveSettings();
verifyServiceHitAndStaleExport();
await verifyPersistentLifecycle();
await verifyCoalescingAndStaleWorkerRejection();
verifySourceContracts();
const performanceMeasurements = verifyPerformanceMeasurements();

const size = estimateStaticTacticalPositionArtifactBytes(snapshot);
console.log(`persistent static tactical basis smoke: ok; raw=${size.rawBytes}; base64=${size.base64Bytes}; performance=${JSON.stringify(performanceMeasurements)}`);

function verifyRoundTrip(): void {
  const cloned = JSON.parse(JSON.stringify(artifact)) as StaticTacticalPositionArtifact;
  const runtimeIdentity = createStaticTacticalPositionBasisIdentity(map, settings);
  const decoded = decodeStaticTacticalPositionArtifact(cloned, fingerprint, runtimeIdentity);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  for (const key of basisArrayKeys()) assert.deepEqual(decoded.snapshot[key], snapshot[key], `${key} round-trip`);
  assert.deepEqual(decoded.snapshot.candidateIndex, snapshot.candidateIndex, 'candidateIndex round-trip');
  for (const key of basisArrayKeys()) assert.ok(decoded.snapshot[key] instanceof Uint8Array, `${key} type`);
  for (const kind of ['observation', 'defense', 'firing'] as const) {
    const list = decoded.snapshot.candidateIndex[kind];
    assert.ok(list.chunkOffsets instanceof Uint32Array);
    assert.ok(list.chunkCounts instanceof Uint16Array);
    assert.ok(list.cellIndices instanceof Uint32Array);
    assert.ok(list.scores instanceof Uint8Array);
    assert.ok(list.postureMasks instanceof Uint8Array);
    assert.ok(list.dominantSectorMasks instanceof Uint32Array);
  }
  assert.notEqual(decoded.snapshot.identityKey, '', 'runtime identity must be restored');
}

function verifyOldSceneCompatibility(): void {
  const old = normalizeImportedScene({ map: openMapData(3, 3), units: [], pressureZones: [] });
  assert.equal(old.staticTacticalPositionArtifact, undefined);
}

function verifyFingerprintStabilityAndInvalidation(): void {
  const reloaded = normalizeMap(JSON.parse(JSON.stringify(exportLikeMapData(map))) as TacticalMapData);
  assert.equal(
    createStaticTacticalPositionFingerprint(reloaded, settings, profile).value,
    fingerprint.value,
    'export/import-equivalent map must preserve fingerprint',
  );

  const reordered = cloneMapData(map);
  reordered.objects = [...(reordered.objects ?? [])].reverse();
  assert.equal(createStaticTacticalPositionFingerprint(normalizeMap(reordered), settings, profile).value, fingerprint.value);

  const revised = testMap();
  markMapObjectsDirty(revised);
  assert.equal(
    createStaticTacticalPositionFingerprint(revised, settings, profile).value,
    fingerprint.value,
    'runtime-only revisions must not affect persistent identity',
  );

  assertFingerprintChanges((data) => { data.heightMap![2]![2] = 3; }, 'height');
  assertFingerprintChanges((data) => { data.surfaceMaterialMap![1]![1] = 'rough'; }, 'terrain');
  assertFingerprintChanges((data) => { data.vegetationMaterialMap![2]![2] = 'dense_forest'; }, 'vegetation');
  assertFingerprintChanges((data) => { data.surfaceMaterialMap![2]![2] = 'road'; }, 'surface material');
  assertFingerprintChanges((data) => { data.objects![0]!.x = Number(data.objects![0]!.x ?? 0) + 1; }, 'object');

  const changedSettings = { ...settings, geometry: { ...settings.geometry, immediateClearanceMeters: settings.geometry.immediateClearanceMeters + 1 } };
  assert.notEqual(createStaticTacticalPositionFingerprint(map, changedSettings, profile).value, fingerprint.value, 'settings');

  const changedProfile = structuredClone(profile) as typeof profile & { surfaces: Record<string, any> };
  const firstSurface = Object.keys(changedProfile.surfaces)[0]!;
  changedProfile.surfaces[firstSurface] = {
    ...changedProfile.surfaces[firstSurface]!,
    movement: {
      ...changedProfile.surfaces[firstSurface]!.movement,
      physicalCost: changedProfile.surfaces[firstSurface]!.movement.physicalCost + 0.1,
    },
  };
  assert.notEqual(createStaticTacticalPositionFingerprint(map, settings, changedProfile).value, fingerprint.value, 'profile material');
}

function verifyArtifactRejections(): void {
  const runtimeIdentity = createStaticTacticalPositionBasisIdentity(map, settings);
  const corrupted = structuredClone(artifact) as any;
  corrupted.payload.data = `${corrupted.payload.data.slice(0, -4)}AAAA`;
  assert.equal(decodeStaticTacticalPositionArtifact(corrupted, fingerprint, runtimeIdentity).ok, false);

  const wrongLength = structuredClone(artifact) as any;
  wrongLength.payload.byteLength += 1;
  const wrongLengthResult = decodeStaticTacticalPositionArtifact(wrongLength, fingerprint, runtimeIdentity);
  assert.equal(wrongLengthResult.ok, false);
  if (!wrongLengthResult.ok) assert.equal(wrongLengthResult.reason, 'payload_length');

  const wrongShape = structuredClone(artifact) as any;
  wrongShape.payload.arrays[0]!.length += 1;
  const wrongShapeResult = decodeStaticTacticalPositionArtifact(wrongShape, fingerprint, runtimeIdentity);
  assert.equal(wrongShapeResult.ok, false);

  const wrongAlgorithm = structuredClone(artifact) as StaticTacticalPositionArtifact & { algorithmVersion: number };
  wrongAlgorithm.algorithmVersion += 1;
  const algorithmResult = decodeStaticTacticalPositionArtifact(wrongAlgorithm, fingerprint, runtimeIdentity);
  assert.equal(algorithmResult.ok, false);
  if (!algorithmResult.ok) assert.equal(algorithmResult.reason, 'algorithm_version');

  expectArtifactReject('malformed base64', (value) => { value.payload.data = '%%%='; }, 'payload_encoding');
  expectArtifactReject('too short payload', (value) => {
    const bytes = Buffer.from(value.payload.data, 'base64');
    value.payload.data = bytes.subarray(0, bytes.length - 1).toString('base64');
  }, 'payload_length');
  expectArtifactReject('too long payload', (value) => {
    const bytes = Buffer.from(value.payload.data, 'base64');
    value.payload.data = Buffer.concat([bytes, Buffer.from([0])]).toString('base64');
  }, 'payload_length');
  expectArtifactReject('overlapping manifest ranges', (value) => {
    value.payload.arrays[1].byteOffset = value.payload.arrays[0].byteOffset;
  }, 'manifest');
  expectArtifactReject('unaligned u16 array', (value) => {
    const descriptor = value.payload.arrays.find((entry: any) => entry.type === 'u16');
    descriptor.byteOffset += 1;
  }, 'manifest');
  expectArtifactReject('unaligned u32 array', (value) => {
    const descriptor = value.payload.arrays.find((entry: any) => entry.type === 'u32');
    descriptor.byteOffset += 2;
  }, 'manifest');
  expectArtifactReject('wrong candidate chunk offset', (value) => {
    mutatePayloadArray(value, 'candidateIndex.observation.chunkOffsets', (view, offset) => view.setUint32(offset, 1, true));
  }, 'candidate_index');
  expectArtifactReject('wrong candidate chunk count', (value) => {
    mutatePayloadArray(value, 'candidateIndex.observation.chunkCounts', (view, offset) => view.setUint16(offset, 0xffff, true));
  }, 'candidate_index');
}

function verifyRejectedArtifactsDoNotChangeActiveSettings(): void {
  const customSettings = {
    ...settings,
    geometry: {
      ...settings.geometry,
      immediateClearanceMeters: settings.geometry.immediateClearanceMeters + 1,
    },
  };
  const customIdentity = createStaticTacticalPositionBasisIdentity(map, customSettings);
  const customSnapshot = buildHighQualityStaticTacticalPositionBasis(map, customIdentity, customSettings).snapshot;
  const customFingerprint = createStaticTacticalPositionFingerprint(map, customSettings, profile);
  const customArtifact = encodeStaticTacticalPositionArtifact(customSnapshot, customFingerprint);

  const rejectedCases: ReadonlyArray<readonly [string, (value: any) => void]> = [
    ['unknown format version', (value) => { value.version += 1; }],
    ['unknown settings version', (value) => { value.settingsVersion += 1; }],
    ['missing settings', (value) => { delete value.settings; }],
    ['invalid settings structure', (value) => { value.settings.geometry = null; }],
    ['invalid settings digest', (value) => { value.settingsDigest = 'deadbeef'; }],
    ['corrupted manifest', (value) => { value.payload.arrays[1].byteOffset = value.payload.arrays[0].byteOffset; }],
    ['corrupted payload', (value) => { value.payload.data = `${value.payload.data.slice(0, -4)}AAAA`; }],
    ['unsupported candidate index structure', (value) => { value.candidateIndex.version += 1; }],
  ];

  for (const [label, corrupt] of rejectedCases) {
    const service = new StaticTacticalPositionService({ map: testMap() } as SimulationState);
    const before = service.getDiagnostics().settingsRevision;
    const rejected = structuredClone(customArtifact) as any;
    corrupt(rejected);
    const result = service.hydratePersistentArtifact(rejected);
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.equal(
      service.getDiagnostics().settingsRevision,
      before,
      `${label} must not change active service settings`,
    );
    service.destroy();
  }

  const mismatchedMap = testMap();
  mismatchedMap.objects[0]!.x += 1;
  const missService = new StaticTacticalPositionService({ map: mismatchedMap } as SimulationState);
  const beforeMiss = missService.getDiagnostics().settingsRevision;
  const miss = missService.hydratePersistentArtifact(customArtifact);
  assert.equal(miss.ok, false, 'valid artifact for another map must miss');
  if (!miss.ok) assert.equal(miss.reason, 'fingerprint');
  assert.equal(
    missService.getDiagnostics().settingsRevision,
    beforeMiss + 1,
    'fully valid artifact with a map fingerprint miss must preserve its settings for rebuild',
  );
  missService.destroy();
}

function verifyServiceHitAndStaleExport(): void {
  const hitMap = testMap();
  const state = { map: hitMap } as SimulationState;
  const service = new StaticTacticalPositionService(state);
  const result = service.hydratePersistentArtifact(artifact);
  assert.equal(result.ok, true, 'matching artifact must be accepted');
  assert.ok(service.readReady(), 'accepted artifact must be returned by readReady');
  assert.equal(service.getDiagnostics().workerJobsStarted, 0, 'persistent hit must not start worker');
  assert.ok(service.buildPersistentArtifactForExport(), 'current ready snapshot must export');
  hitMap.objects[0]!.x += 1;
  assert.equal(service.buildPersistentArtifactForExport(), null, 'stale snapshot must be omitted');
  service.destroy();
}

async function verifyPersistentLifecycle(): Promise<void> {
  const missingService = new StaticTacticalPositionService({ map: testMap() } as SimulationState);
  const missingRevision = missingService.getDiagnostics().settingsRevision;
  const missing = missingService.hydratePersistentArtifact(undefined);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, 'missing');
  assert.equal(missingService.getDiagnostics().settingsRevision, missingRevision, 'missing artifact must not change settings');
  missingService.destroy();

  const hitMap = testMap();
  const hitService = new StaticTacticalPositionService({ map: hitMap } as SimulationState);
  hitService.request();
  const accepted = hitService.hydratePersistentArtifact(artifact);
  assert.equal(accepted.ok, true, 'hydration must supersede an older in-flight build');
  const hydratedFingerprint = hitService.getDiagnostics().readyPersistentFingerprint;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(hitService.getDiagnostics().readyPersistentFingerprint, hydratedFingerprint, 'old fallback result must not replace hydrated snapshot');
  assert.equal(hitService.getDiagnostics().workerJobsCompleted, 0, 'cancelled old build must not complete');
  hitMap.objects[0]!.x += 0.25;
  hitService.request();
  await waitFor(() => hitService.getDiagnostics().status === 'ready' || hitService.getDiagnostics().status === 'failed', 3000);
  assert.equal(hitService.getDiagnostics().workerJobsStarted, 2, 'map edit after cache hit must start one new build');
  const exported = hitService.buildPersistentArtifactForExport();
  assert.ok(exported, 'export after rebuilt edited map must contain the new current snapshot');
  assert.notEqual(exported?.fingerprint.value, fingerprint.value, 'export must not reuse old persistent fingerprint');
  hitService.destroy();

  const missMap = testMap();
  missMap.objects[0]!.x += 0.5;
  const missService = new StaticTacticalPositionService({ map: missMap } as SimulationState);
  const miss = missService.hydratePersistentArtifact(artifact);
  assert.equal(miss.ok, false);
  if (!miss.ok) assert.equal(miss.reason, 'fingerprint');
  missService.request();
  missService.request();
  await waitFor(() => missService.getDiagnostics().status === 'ready' || missService.getDiagnostics().status === 'failed', 3000);
  const missDiagnostics = missService.getDiagnostics();
  assert.equal(missDiagnostics.workerBuildsAfterPersistentMiss, 1, 'cache miss must launch exactly one current rebuild');
  assert.equal(missDiagnostics.workerJobsStarted, 1, 'duplicate requests during cache miss must coalesce');
  const started = missDiagnostics.workerJobsStarted;
  missService.request();
  assert.equal(missService.getDiagnostics().workerJobsStarted, started, 'ready snapshot must prevent redundant heavy rebuild');
  missService.destroy();

  const sourceMapData = {
    ...openMapData(4, 3),
    metersPerCell: 4,
    runtimeMetersPerCell: 2,
    objects: [{ id: 'scaled-rock', kind: 'rock' as const, x: 1, y: 1, widthCells: 1, heightCells: 1 }],
  };
  const runtimeState = createResolutionAwareInitialState(sourceMapData, []);
  const runtimeIdentity = createStaticTacticalPositionBasisIdentity(runtimeState.map, settings);
  const runtimeSnapshot = buildHighQualityStaticTacticalPositionBasis(runtimeState.map, runtimeIdentity, settings).snapshot;
  const runtimeFingerprint = createStaticTacticalPositionFingerprint(runtimeState.map, settings, profile);
  const runtimeArtifact = encodeStaticTacticalPositionArtifact(runtimeSnapshot, runtimeFingerprint);
  const loadedState = createResolutionAwareInitialState(openMapData(1, 1), []);
  replaceSceneAtRuntimeResolution(loadedState, sourceMapData, []);
  const resolutionService = new StaticTacticalPositionService(loadedState);
  assert.equal(resolutionService.hydratePersistentArtifact(runtimeArtifact).ok, true, 'runtime resolution conversion must happen before fingerprint check');
  resolutionService.destroy();
}

async function verifyCoalescingAndStaleWorkerRejection(): Promise<void> {
  const movingMap = testMap();
  const service = new StaticTacticalPositionService({ map: movingMap } as SimulationState);
  service.request();
  for (let index = 0; index < 5; index += 1) {
    movingMap.objects[0]!.x += 0.05;
    service.request();
  }
  await waitFor(() => service.getDiagnostics().workerJobsCompleted >= 2 || service.getDiagnostics().status === 'failed', 3000);
  const diagnostics = service.getDiagnostics();
  assert.ok(diagnostics.workerJobsStarted <= 2, 'intermediate moves must coalesce to one latest rebuild');
  assert.ok(diagnostics.workerResultsStaleDropped >= 1, 'map edit during build must reject stale result');
  service.destroy();
}

function verifySourceContracts(): void {
  const serviceSource = readFileSync('src/core/tactical/static/StaticTacticalPositionService.ts', 'utf8');
  const sceneSource = readFileSync('src/ui/SceneExport.ts', 'utf8');
  assert.ok(serviceSource.includes('sameStaticTacticalPositionIdentity(identity, currentIdentity)'));
  assert.ok(serviceSource.includes('buildStaticTacticalPositionArtifactForExport'));
  assert.ok(sceneSource.indexOf('replaceSceneAtRuntimeResolution') < sceneSource.indexOf('hydrateStaticTacticalPositionArtifact'));
  assert.ok(!sceneSource.includes('await buildStaticTacticalPositionArtifactForExport'));
}

function verifyPerformanceMeasurements(): {
  readonly fingerprintMs: number;
  readonly encodeMs: number;
  readonly decodeMs: number;
  readonly rawPayloadBytes: number;
  readonly base64Bytes: number;
  readonly observedPeakAdditionalBytes: number;
} {
  const largeMap = normalizeMap({
    width: 200,
    height: 200,
    cellSize: 4,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    environmentProfileId: profile.id,
  });
  const before = observedMemoryBytes();
  const fingerprintStarted = performance.now();
  const largeFingerprint = createStaticTacticalPositionFingerprint(largeMap, settings, profile);
  const fingerprintMs = round(performance.now() - fingerprintStarted, 3);
  let peak = Math.max(before, observedMemoryBytes());
  const largeSnapshot = syntheticSnapshot(largeMap);
  peak = Math.max(peak, observedMemoryBytes());
  const encodeStarted = performance.now();
  const largeArtifact = encodeStaticTacticalPositionArtifact(largeSnapshot, largeFingerprint);
  const encodeMs = round(performance.now() - encodeStarted, 3);
  peak = Math.max(peak, observedMemoryBytes());
  const decodeStarted = performance.now();
  const decoded = decodeStaticTacticalPositionArtifact(
    largeArtifact,
    largeFingerprint,
    createStaticTacticalPositionBasisIdentity(largeMap, settings),
  );
  const decodeMs = round(performance.now() - decodeStarted, 3);
  peak = Math.max(peak, observedMemoryBytes());
  assert.equal(decoded.ok, true, '200x200 measurement artifact must decode');
  return {
    fingerprintMs,
    encodeMs,
    decodeMs,
    rawPayloadBytes: largeArtifact.payload.byteLength,
    base64Bytes: largeArtifact.payload.data.length,
    observedPeakAdditionalBytes: Math.max(0, peak - before),
  };
}

function syntheticSnapshot(largeMap: TacticalMap): StaticTacticalPositionBasisSnapshot {
  const identity = createStaticTacticalPositionBasisIdentity(largeMap, settings);
  const arrays = createStaticTacticalPositionBasisArrays(largeMap.width, largeMap.height, settings.sectors.count);
  arrays.availablePostureMask.fill(7);
  return Object.freeze({
    version: 1,
    identity,
    identityKey: staticTacticalPositionIdentityKey(identity),
    width: largeMap.width,
    height: largeMap.height,
    metersPerCell: largeMap.metersPerCell,
    sectorCount: settings.sectors.count,
    ...arrays,
    candidateIndex: createEmptyStaticTacticalCandidateIndex(largeMap.width, largeMap.height, settings.sectors.count),
    settings,
    diagnostics: Object.freeze({
      buildMs: 0,
      cellsProcessed: largeMap.width * largeMap.height,
      observationRays: 0,
      firingRays: 0,
      blockedCells: 0,
      observationCandidates: 0,
      defenseCandidates: 0,
      firingCandidates: 0,
    }),
    builtAtMs: 0,
  });
}

function assertFingerprintChanges(edit: (data: TacticalMapData) => void, label: string): void {
  const data = cloneMapData(map);
  edit(data);
  const changed = createStaticTacticalPositionFingerprint(normalizeMap(data), settings, profile);
  assert.notEqual(changed.value, fingerprint.value, label);
}

function expectArtifactReject(
  label: string,
  mutate: (value: any) => void,
  expectedReason: string,
): void {
  const value = structuredClone(artifact) as any;
  mutate(value);
  const result = decodeStaticTacticalPositionArtifact(
    value,
    fingerprint,
    createStaticTacticalPositionBasisIdentity(map, settings),
  );
  assert.equal(result.ok, false, `${label} must be rejected`);
  if (!result.ok) assert.equal(result.reason, expectedReason, label);
}

function mutatePayloadArray(
  value: any,
  name: string,
  mutate: (view: DataView, byteOffset: number) => void,
): void {
  const descriptor = value.payload.arrays.find((entry: any) => entry.name === name);
  assert.ok(descriptor, `missing descriptor ${name}`);
  const bytes = Uint8Array.from(Buffer.from(value.payload.data, 'base64'));
  mutate(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), descriptor.byteOffset);
  value.payload.data = Buffer.from(bytes).toString('base64');
  value.payload.byteLength = bytes.length;
  value.payload.checksum = testChecksumBytes(bytes);
}

function testChecksumBytes(bytes: Uint8Array): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const byte of bytes) {
    left = Math.imul(left ^ byte, 0x01000193) >>> 0;
    right = Math.imul(right ^ (byte + 0x9d), 0x85ebca6b) >>> 0;
  }
  return `stpc-${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`;
}

function observedMemoryBytes(): number {
  const memory = process.memoryUsage();
  return memory.heapUsed + memory.arrayBuffers;
}

function testMap(): TacticalMap {
  return normalizeMap({
    ...openMapData(7, 6),
    heightMap: Array.from({ length: 6 }, () => Array(7).fill(0)),
    forestMap: Array.from({ length: 6 }, () => Array(7).fill(0)),
    surfaceMaterialMap: Array.from({ length: 6 }, () => Array(7).fill('field')),
    vegetationMaterialMap: Array.from({ length: 6 }, () => Array(7).fill('none')),
    objects: [{
      id: 'wall-a', kind: 'cover', x: 3.1254, y: 2.25,
      widthCells: 0.8, heightCells: 2.4, rotationDegrees: 27.34,
      losHeightMeters: 1.3, coverProtection: 80, coverReliability: 90,
      concealment: 15, penetrable: false, coverPosture: 'crouched',
    }, {
      id: 'rock-b', kind: 'rock', x: 5, y: 4,
      widthCells: 0.7, heightCells: 0.7, rotationDegrees: 0,
    }],
  });
}

function openMapData(width: number, height: number): TacticalMapData {
  return { width, height, cellSize: 4, metersPerCell: 2, defaultTerrain: 'field', defaultHeight: 0 };
}

function cloneMapData(source: TacticalMap): TacticalMapData {
  return structuredClone(exportLikeMapData(source));
}

function exportLikeMapData(source: TacticalMap): TacticalMapData {
  return {
    width: source.width,
    height: source.height,
    cellSize: source.cellSize,
    metersPerCell: source.metersPerCell,
    defaultTerrain: source.defaultTerrain,
    defaultHeight: source.defaultHeight,
    environmentProfileId: source.environmentProfileId,
    heightMap: Array.from({ length: source.height }, (_, y) => Array.from({ length: source.width }, (_, x) => source.cells[y * source.width + x]!.height)),
    forestMap: Array.from({ length: source.height }, (_, y) => Array.from({ length: source.width }, (_, x) => source.cells[y * source.width + x]!.forest)),
    surfaceMaterialMap: Array.from({ length: source.height }, (_, y) => Array.from({ length: source.width }, (_, x) => source.cells[y * source.width + x]!.surfaceMaterialId)),
    vegetationMaterialMap: Array.from({ length: source.height }, (_, y) => Array.from({ length: source.width }, (_, x) => source.cells[y * source.width + x]!.vegetationMaterialId)),
    objects: source.objects.map((object) => ({
      id: object.id, kind: object.kind,
      x: round(object.x, 3), y: round(object.y, 3),
      widthCells: round(object.widthCells, 3), heightCells: round(object.heightCells, 3),
      rotationDegrees: round(object.rotationRadians * 180 / Math.PI, 1),
      losHeightMeters: round(object.losHeightMeters ?? 1, 1),
      coverProtection: round(object.coverProtection ?? 0, 1),
      coverReliability: round(object.coverReliability ?? 0, 1),
      concealment: round(object.concealment ?? 0, 1),
      penetrable: object.penetrable,
      coverPosture: object.coverPosture,
    })),
  };
}

function basisArrayKeys(): ReadonlyArray<
  'observationPotential' | 'defensePotential' | 'firingPotential'
  | 'observationByDirection' | 'protectionByDirection' | 'firingByDirection'
  | 'availablePostureMask' | 'concealment' | 'staticProtectionByPosture'
  | 'observationByPosture' | 'firingByPosture' | 'surfaceSuitability'
  | 'reverseSlopeByDirection' | 'immediateFireClearanceByDirection'
> {
  return [
    'observationPotential', 'defensePotential', 'firingPotential',
    'observationByDirection', 'protectionByDirection', 'firingByDirection',
    'availablePostureMask', 'concealment', 'staticProtectionByPosture',
    'observationByPosture', 'firingByPosture', 'surfaceSuitability',
    'reverseSlopeByDirection', 'immediateFireClearanceByDirection',
  ];
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for static basis service.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function round(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
