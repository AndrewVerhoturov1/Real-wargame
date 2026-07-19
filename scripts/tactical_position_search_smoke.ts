import assert from 'node:assert/strict';
import {
  searchTacticalPositions,
  type TacticalPositionFieldView,
} from '../src/core/tactical/TacticalPositionSearch';

verifyThreatRelativeFieldChoosesProtectedSide();
verifyBlockedCellsAndDuplicatePlateausAreExcluded();
verifyPostureRecommendationUsesPreparedPostureFields();
verifyDeterministicBudgetsBoundRouteWork();

console.log('Tactical position search smoke passed: field-owned candidates, posture recommendation, non-maximum suppression and deterministic work budgets.');

function verifyThreatRelativeFieldChoosesProtectedSide(): void {
  const field = createField(14, 9);
  const origin = { x: 2.5, y: 4.5 };
  setArea(field, 8, 2, 11, 6, {
    danger: 14,
    suppression: 8,
    safety: 86,
    protection: 82,
    concealment: 34,
    reverseSlope: 72,
  });
  setArea(field, 4, 2, 6, 6, {
    danger: 78,
    suppression: 64,
    safety: 18,
    protection: 4,
    concealment: 10,
    forwardSlope: 70,
  });

  const result = searchTacticalPositions(field, {
    origin,
    currentPosture: 'standing',
    orderTarget: null,
    threatCount: 1,
    searchRadiusMeters: 24,
    maxSampledCells: 220,
    maxRouteExpansions: 220,
    maxCandidates: 8,
    minimumSeparationMeters: 4,
  });

  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.every((candidate) => candidate.source.kind !== 'map_object'));
  const winner = result.candidates[0]!;
  assert.ok(winner.position.x >= 8.5, `expected protected side, got ${winner.position.x},${winner.position.y}`);
  assert.ok(winner.metrics.protection >= 70);
  assert.ok(winner.metrics.danger <= 20);
  assert.equal(winner.metrics.blocksThreat, true);
}

function verifyBlockedCellsAndDuplicatePlateausAreExcluded(): void {
  const field = createField(12, 8);
  const blockedIndex = index(field, 8, 4);
  field.passable[blockedIndex] = 0;
  setArea(field, 7, 3, 10, 5, {
    danger: 10,
    safety: 92,
    protection: 78,
    concealment: 45,
  });

  const result = searchTacticalPositions(field, {
    origin: { x: 2.5, y: 4.5 },
    currentPosture: 'crouched',
    orderTarget: null,
    threatCount: 1,
    searchRadiusMeters: 24,
    maxSampledCells: 180,
    maxRouteExpansions: 180,
    maxCandidates: 12,
    minimumSeparationMeters: 4,
  });

  assert.ok(result.candidates.every((candidate) => !(Math.floor(candidate.position.x) === 8 && Math.floor(candidate.position.y) === 4)));
  for (let left = 0; left < result.candidates.length; left += 1) {
    for (let right = left + 1; right < result.candidates.length; right += 1) {
      const a = result.candidates[left]!.position;
      const b = result.candidates[right]!.position;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 1.9, 'near-identical plateau candidates must be merged');
    }
  }
}

function verifyPostureRecommendationUsesPreparedPostureFields(): void {
  const field = createField(10, 7);
  const targetIndex = index(field, 7, 3);
  field.danger[targetIndex] = 62;
  field.safety[targetIndex] = 48;
  field.expectedProtectionAgainstThreat[targetIndex] = 28;
  field.staticProtectionByPosture.standing[targetIndex] = 12;
  field.staticProtectionByPosture.crouched[targetIndex] = 55;
  field.staticProtectionByPosture.prone[targetIndex] = 88;

  const result = searchTacticalPositions(field, {
    origin: { x: 2.5, y: 3.5 },
    currentPosture: 'standing',
    orderTarget: null,
    threatCount: 1,
    searchRadiusMeters: 20,
    maxSampledCells: 140,
    maxRouteExpansions: 140,
    maxCandidates: 6,
    minimumSeparationMeters: 2,
  });

  const candidate = result.candidates.find((item) => Math.floor(item.position.x) === 7 && Math.floor(item.position.y) === 3);
  assert.ok(candidate, 'the prepared low-cover cell should remain a candidate after posture evaluation');
  assert.equal(candidate.metrics.recommendedPosture, 'prone');
  assert.ok(candidate.metrics.protection > field.expectedProtectionAgainstThreat[targetIndex]!);
  assert.ok(candidate.metrics.danger < field.danger[targetIndex]!);
}

function verifyDeterministicBudgetsBoundRouteWork(): void {
  const field = createField(40, 30);
  setArea(field, 20, 8, 34, 22, {
    danger: 18,
    safety: 80,
    protection: 66,
    concealment: 40,
  });
  const request = {
    origin: { x: 3.5, y: 15.5 },
    currentPosture: 'standing' as const,
    orderTarget: { x: 35.5, y: 15.5 },
    threatCount: 2,
    searchRadiusMeters: 70,
    maxSampledCells: 90,
    maxRouteExpansions: 64,
    maxCandidates: 10,
    minimumSeparationMeters: 4,
  };

  const first = searchTacticalPositions(field, request);
  const second = searchTacticalPositions(field, request);

  assert.ok(first.diagnostics.sampledCells <= request.maxSampledCells);
  assert.ok(first.diagnostics.routeExpandedCells <= request.maxRouteExpansions);
  assert.deepEqual(
    first.candidates.map((candidate) => ({ id: candidate.id, position: candidate.position, metrics: candidate.metrics })),
    second.candidates.map((candidate) => ({ id: candidate.id, position: candidate.position, metrics: candidate.metrics })),
    'wall-clock timing must not affect candidate identity or metrics',
  );
}

function createField(width: number, height: number): TacticalPositionFieldView {
  const count = width * height;
  const bytes = (value: number) => {
    const result = new Uint8Array(count);
    result.fill(value);
    return result;
  };
  const movementCost = new Float32Array(count);
  movementCost.fill(1);
  return {
    width,
    height,
    metersPerCell: 2,
    passable: bytes(1),
    movementCost,
    danger: bytes(45),
    suppression: bytes(25),
    concealment: bytes(5),
    safety: bytes(42),
    expectedProtectionAgainstThreat: bytes(8),
    uncertainty: bytes(10),
    reverseSlopeQuality: bytes(0),
    forwardSlopeRisk: bytes(0),
    staticProtectionByPosture: {
      standing: bytes(8),
      crouched: bytes(18),
      prone: bytes(32),
    },
  };
}

function setArea(
  field: TacticalPositionFieldView,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  values: {
    danger?: number;
    suppression?: number;
    safety?: number;
    protection?: number;
    concealment?: number;
    reverseSlope?: number;
    forwardSlope?: number;
  },
): void {
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const cellIndex = index(field, x, y);
      if (values.danger !== undefined) field.danger[cellIndex] = values.danger;
      if (values.suppression !== undefined) field.suppression[cellIndex] = values.suppression;
      if (values.safety !== undefined) field.safety[cellIndex] = values.safety;
      if (values.protection !== undefined) field.expectedProtectionAgainstThreat[cellIndex] = values.protection;
      if (values.concealment !== undefined) field.concealment[cellIndex] = values.concealment;
      if (values.reverseSlope !== undefined) field.reverseSlopeQuality[cellIndex] = values.reverseSlope;
      if (values.forwardSlope !== undefined) field.forwardSlopeRisk[cellIndex] = values.forwardSlope;
    }
  }
}

function index(field: Pick<TacticalPositionFieldView, 'width'>, x: number, y: number): number {
  return y * field.width + x;
}
