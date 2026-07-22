import assert from 'node:assert/strict';
import { searchGeneralizedTacticalPositions } from '../src/core/tactical/GeneralizedTacticalPositionSearchRuntime';
import { createDefaultTacticalPositionNodeParameters, readTacticalPositionNodeSettings } from '../src/core/tactical/TacticalPositionNodeSettings';

const width = 11;
const height = 3;
const count = width * height;
const sectors = 8;
const cell = (x: number, y = 1) => y * width + x;
function field() {
  const passable = new Uint8Array(count); passable.fill(1);
  const movementCost = new Float32Array(count); movementCost.fill(1);
  const zero = () => new Uint8Array(count);
  const direction = () => { const value = new Uint8Array(count * sectors); value.fill(255); return value; };
  const posture = () => { const value = new Uint8Array(count * 3); value.fill(255); return value; };
  return {
    width, height, metersPerCell: 1, passable, movementCost,
    danger: zero(), suppression: zero(), concealment: zero(), uncertainty: zero(), reverseSlopeQuality: zero(), forwardSlopeRisk: zero(),
    staticBasis: {
      width, height, sectorCount: sectors,
      candidateIndex: candidateIndex(),
      observationByDirection: direction(), protectionByDirection: direction(), firingByDirection: direction(),
      staticProtectionByPosture: posture(), observationByPosture: posture(), firingByPosture: posture(), concealment: zero(),
    },
  };
}
function candidateIndex() {
  const list = () => ({
    chunkOffsets: new Uint32Array([0]),
    chunkCounts: new Uint16Array([2]),
    cellIndices: new Uint32Array([cell(2), cell(8)]),
    scores: new Uint8Array([255, 255]),
    postureMasks: new Uint8Array([7, 7]),
    dominantSectorMasks: new Uint32Array([1, 1]),
  });
  return {
    version: 1 as const,
    width,
    height,
    sectorCount: sectors,
    chunkSizeCells: 16,
    chunksX: 1,
    chunksY: 1,
    observation: list(),
    defense: list(),
    firing: list(),
  };
}
function request(objective: 'balanced' | 'advance_to_threat' | 'withdraw_from_threat', settings: ReturnType<typeof readTacticalPositionNodeSettings>['search']) {
  return {
    requestIdentity: 'fixture', kind: 'defense' as const, objective,
    origin: { x: 5.5, y: 1.5 }, currentPosture: 'standing' as const,
    orderTarget: null, referenceThreatId: 'threat', referenceThreatPosition: { x: 10.5, y: 1.5 }, target: null,
    searchRadiusMeters: 10, maxRouteExpansions: 256, maxCandidates: settings.searchBudget.maxCandidates,
    minimumSeparationMeters: 0, settings,
  };
}
const strong = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense'),
  tacticalQualityWeight: 0.2, movementObjectiveWeight: 1, maxCandidates: 1,
}).search;
assert.equal(searchGeneralizedTacticalPositions(field(), request('advance_to_threat', strong)).candidates[0]?.position.x, 8.5);
assert.equal(searchGeneralizedTacticalPositions(field(), request('withdraw_from_threat', strong)).candidates[0]?.position.x, 2.5);
const off = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense'), movementObjectiveWeight: 0, maxCandidates: 1,
}).search;
assert.equal(searchGeneralizedTacticalPositions(field(), request('advance_to_threat', off)).candidates[0]?.position.x, 2.5);
assert.equal(searchGeneralizedTacticalPositions(field(), request('withdraw_from_threat', off)).candidates[0]?.position.x, 2.5);
const dangerField = field(); dangerField.danger[cell(2)] = 90;
const dangerSettings = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense'), maxCandidates: 2, maxPositionDanger: 78,
}).search;
assert.deepEqual(searchGeneralizedTacticalPositions(dangerField, request('balanced', dangerSettings)).candidates.map((candidate) => candidate.position.x), [8.5]);
const distanceSettings = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense'), maxCandidates: 1,
  desiredDistanceMeters: 2, desiredDistanceToleranceMeters: 0.1, desiredDistanceWeight: 5, movementObjectiveWeight: 0,
}).search;
assert.equal(searchGeneralizedTacticalPositions(field(), request('balanced', distanceSettings)).candidates[0]?.position.x, 8.5);
const limited = readTacticalPositionNodeSettings({
  ...createDefaultTacticalPositionNodeParameters('defense'), maxCandidates: 1,
  preliminaryCandidates: 8, exactCandidates: 1, exactRayLimit: 0, maxRouteExpansions: 64,
}).search;
const limitedResult = searchGeneralizedTacticalPositions(field(), request('balanced', limited));
const diagnostics = limitedResult.diagnostics as typeof limitedResult.diagnostics & TacticalPositionDiagnostics;
assert.equal(limitedResult.candidates.length, 1);
assert.ok(diagnostics.provisionalCandidates <= 8);
assert.ok(diagnostics.exactCandidates <= 1);
assert.equal(diagnostics.exactRays, 0);
assert.ok(diagnostics.routeExpandedCells <= 64);
console.log('generalized tactical position settings smoke passed');

interface TacticalPositionDiagnostics { readonly exactCandidates: number; readonly exactRays: number; }
