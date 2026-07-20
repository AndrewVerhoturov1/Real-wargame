import assert from 'node:assert/strict';
import { createDefaultTacticalPositionSettings } from '../src/core/tactical/TacticalPositionSettings';
import {
  searchTacticalPositionsForObjective,
  type TacticalPositionSearchObjective,
} from '../src/core/tactical/TacticalPositionObjective';
import type { TacticalPositionFieldView } from '../src/core/tactical/TacticalPositionSearch';

verifyThreatObjectives();
verifyContinueOrderObjective();
verifyObjectiveWeightsControlDirectionalPreference();

console.log('Tactical position objective smoke passed: advance, withdraw, continue-order metrics and ranking.');

function verifyThreatObjectives(): void {
  const field = createField();
  const advance = search(field, 'advance_to_threat', null);
  const withdraw = search(field, 'withdraw_from_threat', null);
  assert.ok(advance.candidates.length > 1);
  assert.ok(withdraw.candidates.length > 1);

  const advanceWinner = advance.candidates[0]!;
  const withdrawWinner = withdraw.candidates[0]!;
  assert.ok(
    (advanceWinner.metrics.threatDistanceDeltaMeters ?? 0) < 0,
    'advance objective must prefer a valid position closer to the threat',
  );
  assert.ok(
    (withdrawWinner.metrics.threatDistanceDeltaMeters ?? 0) > 0,
    'withdraw objective must prefer a valid position farther from the threat',
  );
  assert.ok(
    (advanceWinner.metrics.distanceToThreatMeters ?? Number.POSITIVE_INFINITY)
      < (withdrawWinner.metrics.distanceToThreatMeters ?? 0),
  );
  assert.equal(advanceWinner.metrics.referenceThreatId, 'threat-east');
  assert.ok((advanceWinner.metrics.objectiveAlignment ?? 0) > 50);
  assert.ok((withdrawWinner.metrics.objectiveAlignment ?? 0) > 50);
}

function verifyContinueOrderObjective(): void {
  const orderTarget = { x: 10.5, y: 1.5 };
  const result = search(createField(), 'continue_order', orderTarget);
  assert.ok(result.candidates.length > 1);
  const winnerDistance = result.candidates[0]!.metrics.distanceToOrderTargetMeters;
  const nextDistance = result.candidates[1]!.metrics.distanceToOrderTargetMeters;
  assert.notEqual(winnerDistance, null);
  assert.ok((winnerDistance ?? Number.POSITIVE_INFINITY) <= (nextDistance ?? Number.POSITIVE_INFINITY));
  assert.ok((result.candidates[0]!.metrics.objectiveAlignment ?? 0) >= 50);
}

function search(
  field: TacticalPositionFieldView,
  objective: TacticalPositionSearchObjective,
  orderTarget: { x: number; y: number } | null,
) {
  const settings = createDefaultTacticalPositionSettings();
  settings.minimumPositionImprovement = 0;
  settings.minimumDirectionalProtection = 1;
  settings.minimumReverseSlopeQuality = 0;
  settings.crouchedSafetyAdvantageThreshold = 4;
  settings.proneSafetyAdvantageThreshold = 4;
  return searchTacticalPositionsForObjective(field, {
    origin: { x: 6.5, y: 1.5 },
    currentPosture: 'standing',
    orderTarget,
    threatCount: 1,
    searchRadiusMeters: 6,
    maxSampledCells: 128,
    maxRouteExpansions: 128,
    maxCandidates: 6,
    minimumSeparationMeters: 1,
    settings,
    objective,
    referenceThreatId: 'threat-east',
    referenceThreatPosition: { x: 12.5, y: 1.5 },
  });
}


function verifyObjectiveWeightsControlDirectionalPreference(): void {
  const field = createField();
  const settings = createDefaultTacticalPositionSettings();
  settings.minimumPositionImprovement = 0;
  settings.minimumDirectionalProtection = 1;
  settings.minimumReverseSlopeQuality = 0;
  settings.advanceToThreatWeight = 0;
  settings.withdrawFromThreatWeight = 0;
  settings.orderTargetDistanceWeight = 0;
  settings.objectiveAlignmentWeight = 0;
  const common = {
    origin: { x: 6.5, y: 1.5 },
    currentPosture: 'standing' as const,
    orderTarget: null,
    threatCount: 1,
    searchRadiusMeters: 6,
    maxSampledCells: 128,
    maxRouteExpansions: 128,
    maxCandidates: 6,
    minimumSeparationMeters: 1,
    settings,
    referenceThreatId: 'threat-east',
    referenceThreatPosition: { x: 12.5, y: 1.5 },
  };
  const balanced = searchTacticalPositionsForObjective(field, { ...common, objective: 'balanced' });
  const advance = searchTacticalPositionsForObjective(field, { ...common, objective: 'advance_to_threat' });
  assert.deepEqual(
    advance.candidates.map((candidate) => candidate.id),
    balanced.candidates.map((candidate) => candidate.id),
    'zero objective weights must disable directional reranking',
  );
}

function createField(): TacticalPositionFieldView {
  const width = 13;
  const height = 3;
  const count = width * height;
  const passable = new Uint8Array(count);
  passable.fill(1);
  const movementCost = new Float32Array(count);
  movementCost.fill(1);
  const danger = new Uint8Array(count);
  danger.fill(22);
  const suppression = new Uint8Array(count);
  suppression.fill(10);
  const concealment = new Uint8Array(count);
  concealment.fill(35);
  const safety = new Uint8Array(count);
  safety.fill(72);
  safety[1 * width + 6] = 35;
  const expectedProtectionAgainstThreat = new Uint8Array(count);
  expectedProtectionAgainstThreat.fill(45);
  const uncertainty = new Uint8Array(count);
  uncertainty.fill(5);
  const reverseSlopeQuality = new Uint8Array(count);
  reverseSlopeQuality.fill(20);
  const forwardSlopeRisk = new Uint8Array(count);
  const standing = new Uint8Array(count);
  standing.fill(16);
  const crouched = new Uint8Array(count);
  crouched.fill(46);
  const prone = new Uint8Array(count);
  prone.fill(72);
  return {
    width,
    height,
    metersPerCell: 1,
    passable,
    movementCost,
    danger,
    suppression,
    concealment,
    safety,
    expectedProtectionAgainstThreat,
    uncertainty,
    reverseSlopeQuality,
    forwardSlopeRisk,
    staticProtectionByPosture: { standing, crouched, prone },
  };
}
