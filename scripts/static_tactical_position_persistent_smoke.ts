import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getActiveEnvironmentProfile } from '../src/core/map/EnvironmentProfileRuntime';
import { normalizeMap, type TacticalMap, type TacticalMapData } from '../src/core/map/MapModel';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  decodeStaticTacticalPositionArtifact,
  encodeStaticTacticalPositionArtifact,
  estimateStaticTacticalPositionArtifactBytes,
  type StaticTacticalPositionArtifact,
} from '../src/core/tactical/static/StaticTacticalPositionArtifact';
import { buildHighQualityStaticTacticalPositionBasis } from '../src/core/tactical/static/HighQualityStaticTacticalPositionBuilder';
import { createStaticTacticalPositionFingerprint } from '../src/core/tactical/static/StaticTacticalPositionFingerprint';
import { createStaticTacticalPositionBasisIdentity } from '../src/core/tactical/static/StaticTacticalPositionIdentity';
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
await verifyCoalescingAndStaleWorkerRejection();
verifySourceContracts();

const size = estimateStaticTacticalPositionArtifactBytes(snapshot);
console.log(`persistent static tactical basis smoke: ok; raw=${size.rawBytes}; base64=${size.base64Bytes}`);

function verifyRoundTrip(): void {
  const cloned = JSON.parse(JSON.stringify(artifact)) as StaticTacticalPositionArtifact;
  const runtimeIdentity = createStaticTacticalPositionBasisIdentity(map, settings);
  const decoded = decodeStaticTacticalPositionArtifact(cloned, fingerprint, runtimeIdentity);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  for (const key of basisArrayKeys()) assert.deepEqual(decoded.snapshot[key], snapshot[key], `${key} round-trip`);
  assert.deepEqual(decoded.snapshot.candidateIndex, snapshot.candidateIndex, 'candidateIndex round-trip');
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

function assertFingerprintChanges(edit: (data: TacticalMapData) => void, label: string): void {
  const data = cloneMapData(map);
  edit(data);
  const changed = createStaticTacticalPositionFingerprint(normalizeMap(data), settings, profile);
  assert.notEqual(changed.value, fingerprint.value, label);
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
