import assert from 'node:assert/strict';
import { refineTacticalPositionSearchResult } from '../src/core/tactical/TacticalPositionResultRefiner';
import type { GeneralizedTacticalPositionSearchRequest } from '../src/core/tactical/GeneralizedTacticalPositionSearch';
import type { TacticalPositionQuerySubjectiveFieldSnapshot } from '../src/core/tactical/TacticalPositionQueryWorkerProtocol';
import type { TacticalPositionSearchResult } from '../src/core/tactical/TacticalPositionSearch';

const field: TacticalPositionQuerySubjectiveFieldSnapshot = {
  width: 2,
  height: 1,
  metersPerCell: 1,
  passable: new Uint8Array([1, 1]),
  movementCost: new Float32Array([1, 1]),
  danger: new Uint8Array([20, 20]),
  suppression: new Uint8Array(2),
  concealment: new Uint8Array([30, 30]),
  safety: new Uint8Array([80, 80]),
  expectedProtectionAgainstThreat: new Uint8Array([20, 90]),
  uncertainty: new Uint8Array([10, 10]),
  reverseSlopeQuality: new Uint8Array(2),
  forwardSlopeRisk: new Uint8Array(2),
  staticProtectionStanding: new Uint8Array(2),
  staticProtectionCrouched: new Uint8Array(2),
  staticProtectionProne: new Uint8Array(2),
};

const request: GeneralizedTacticalPositionSearchRequest = {
  requestIdentity: 'request-1',
  kind: 'defense',
  objective: 'balanced',
  origin: { x: 0.5, y: 0.5 },
  currentPosture: 'standing',
  orderTarget: null,
  referenceThreatId: 'known-threat',
  referenceThreatPosition: { x: 5, y: 0.5 },
  target: { mode: 'known_threats' },
  searchRadiusMeters: 20,
  maxRouteExpansions: 64,
  maxCandidates: 4,
  minimumSeparationMeters: 1,
};

function candidate(id: string, x: number): TacticalPositionSearchResult['candidates'][number] {
  return {
    id,
    kind: 'defense',
    objective: 'balanced',
    requestIdentity: 'request-1',
    position: { x, y: 0.5 },
    source: { kind: 'static_basis', id, label: id, labelRu: id },
    metrics: {
      onMap: true,
      routeExists: true,
      distanceMeters: x,
      blocksThreat: true,
      protection: 45,
      concealment: 30,
      routeDanger: 20,
      slopeType: 'flat',
      orderAlignment: 50,
      objectiveAlignment: 50,
      staticPotential: 60,
      directionalFit: 60,
      lineQuality: 50,
      rangeFit: 100,
      uncertainty: 10,
      positionDanger: 20,
      withdrawalQuality: 50,
      danger: 20,
      suppression: 0,
      safety: 80,
      safetyGain: 0,
      routeCost: 1,
      recommendedPosture: 'crouched',
      alternativePostureMask: 7,
      recommendedFacingRadians: 0,
      postureReason: 'test',
      postureReasonRu: 'проверка',
    },
  };
}

const raw: TacticalPositionSearchResult = {
  candidates: [candidate('low-subjective-cover', 0.5), candidate('high-subjective-cover', 1.5)],
  diagnostics: {
    sampledCells: 2,
    routeExpandedCells: 2,
    provisionalCandidates: 2,
    sampleBudgetExhausted: false,
    routeBudgetExhausted: false,
  },
};

const refined = refineTacticalPositionSearchResult(field, request, raw);
assert.equal(refined.candidates[0]?.id, 'high-subjective-cover');
assert.ok((refined.candidates[0]?.metrics.protection ?? 0) > (refined.candidates[1]?.metrics.protection ?? 0));
assert.equal(typeof (refined.candidates[0]?.metrics as { finalScore?: unknown }).finalScore, 'number');

console.log('tactical position result refiner smoke: ok');
