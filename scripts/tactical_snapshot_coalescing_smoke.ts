import assert from 'node:assert/strict';
import type { TacticalMapData } from '../src/core/map/MapModel';
import {
  buildUnitTacticalRouteContext,
  clearUnitTacticalRouteContext,
} from '../src/core/navigation/NavigationRuntime';
import {
  createRouteCostFieldCache,
  getRouteCostFieldDiagnostics,
  getRouteCostFields,
} from '../src/core/navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../src/core/navigation/NavigationProfiles';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { KnownThreatMemory } from '../src/core/units/UnitModel';

const map: TacticalMapData = {
  width: 12,
  height: 8,
  cellSize: 24,
  metersPerCell: 5,
  defaultTerrain: 'field',
};
const state = createInitialState(map, [{
  id: 'snapshot-observer',
  label: 'Observer',
  labelRu: 'Наблюдатель',
  type: 'infantry_squad',
  side: 'blue',
  x: 2,
  y: 3,
}]);
const unit = state.units[0];
assert.ok(unit);
const movingThreat = threat('unit:moving', 9.5, 3.5, true);
unit.tacticalKnowledge.threats = [movingThreat];
unit.tacticalKnowledge.revision = 1;
unit.tacticalKnowledge.lastUpdatedSeconds = 1;

const initial = buildUnitTacticalRouteContext(unit, {
  freshness: 'coalesced',
  metersPerCell: map.metersPerCell,
});
movingThreat.x = 8.75;
unit.tacticalKnowledge.revision = 2;
unit.tacticalKnowledge.lastUpdatedSeconds = 1.1;
const coalesced = buildUnitTacticalRouteContext(unit, {
  freshness: 'coalesced',
  metersPerCell: map.metersPerCell,
});
assert.equal(coalesced, initial, 'sub-window movement must reuse the coherent tactical snapshot');
assert.equal(coalesced.knownThreats[0].x, 9.5, 'coalescing must never mutate an already published snapshot');

unit.tacticalKnowledge.lastUpdatedSeconds = 1.51;
const elapsed = buildUnitTacticalRouteContext(unit, {
  freshness: 'coalesced',
  metersPerCell: map.metersPerCell,
});
assert.notEqual(elapsed, initial, 'the bounded simulation-time window must eventually publish the new position');
assert.equal(elapsed.knownThreats[0].x, 8.5);

movingThreat.directionDegrees = 45;
movingThreat.rangeCells = 3;
unit.tacticalKnowledge.revision = 3;
unit.tacticalKnowledge.lastUpdatedSeconds = 1.55;
const observerRelativeOnly = buildUnitTacticalRouteContext(unit, {
  freshness: 'immediate',
  metersPerCell: map.metersPerCell,
});
assert.equal(
  observerRelativeOnly,
  elapsed,
  'observer-relative unit-contact descriptors must not invalidate a world-space route snapshot',
);

movingThreat.strength = 75;
movingThreat.confidence = 90;
unit.tacticalKnowledge.revision = 4;
const scalarNoise = buildUnitTacticalRouteContext(unit, {
  freshness: 'coalesced',
  metersPerCell: map.metersPerCell,
});
assert.equal(scalarNoise, elapsed, 'minor score-only drift must not trigger a route-field rebuild');

movingThreat.strength = 90;
unit.tacticalKnowledge.revision = 5;
const significantScalar = buildUnitTacticalRouteContext(unit, {
  freshness: 'immediate',
  metersPerCell: map.metersPerCell,
});
assert.notEqual(significantScalar, elapsed, 'a meaningful danger-score change must publish immediately');

movingThreat.x = 7.9;
unit.tacticalKnowledge.revision = 6;
unit.tacticalKnowledge.lastUpdatedSeconds = 1.56;
const immediate = buildUnitTacticalRouteContext(unit, {
  freshness: 'immediate',
  metersPerCell: map.metersPerCell,
});
assert.notEqual(immediate, significantScalar, 'initial order planning must be able to request the current snapshot immediately');
assert.equal(immediate.knownThreats[0].x, 7.5);

const addedThreat = threat('unknown-fire:new', 7.5, 6.5, false);
unit.tacticalKnowledge.threats.push(addedThreat);
unit.tacticalKnowledge.revision = 7;
unit.tacticalKnowledge.lastUpdatedSeconds = 1.6;
const topologyChange = buildUnitTacticalRouteContext(unit, {
  freshness: 'coalesced',
  metersPerCell: map.metersPerCell,
});
assert.notEqual(topologyChange, immediate, 'new/removed threats must bypass movement coalescing');
assert.equal(topologyChange.knownThreats.length, 2);

const routeCache = createRouteCostFieldCache();
const profile = getBuiltInNavigationProfile('normal');
const readyFields = getRouteCostFields(state.map, profile, topologyChange, routeCache);
const reusedFields = getRouteCostFields(state.map, profile, topologyChange, routeCache);
assert.equal(reusedFields, readyFields, 'the same UI/AI snapshot must read already prepared route fields');
assert.equal(getRouteCostFieldDiagnostics(routeCache).snapshotReuseCount, 1);

verifyImmediateBypassesCoalescedScoreSuppression();
verifyObserverDependentSnapshotIdentity();

clearUnitTacticalRouteContext(unit);
assert.notEqual(buildUnitTacticalRouteContext(unit, {
  freshness: 'coalesced',
  metersPerCell: map.metersPerCell,
}), topologyChange, 'explicit reset must discard the cached snapshot');

console.log('Tactical snapshot coalescing smoke passed: movement is time-bounded while orders and topology changes remain immediate.');

function verifyImmediateBypassesCoalescedScoreSuppression(): void {
  for (const scalar of ['strength', 'suppression', 'confidence'] as const) {
    clearUnitTacticalRouteContext(unit);
    const current = threat(`unit:immediate-${scalar}`, 9.5, 3.5, true);
    current.strength = 70;
    current.suppression = 20;
    current.confidence = 70;
    unit.tacticalKnowledge.threats = [current];
    unit.tacticalKnowledge.revision = 100;
    unit.tacticalKnowledge.lastUpdatedSeconds = 10;

    const published = buildUnitTacticalRouteContext(unit, {
      freshness: 'coalesced',
      metersPerCell: map.metersPerCell,
    });
    const nextValue = scalar === 'suppression' ? 25 : 75;
    const expectedCanonicalValue = scalar === 'confidence' ? 80 : nextValue;
    current[scalar] = nextValue;
    unit.tacticalKnowledge.revision += 1;
    unit.tacticalKnowledge.lastUpdatedSeconds += 0.1;

    const suppressed = buildUnitTacticalRouteContext(unit, {
      freshness: 'coalesced',
      metersPerCell: map.metersPerCell,
    });
    assert.equal(suppressed, published, `coalesced ${scalar} drift must retain the published snapshot`);
    assert.equal(suppressed.knownThreats[0]?.[scalar], scalar === 'suppression' ? 20 : 70);

    const exact = buildUnitTacticalRouteContext(unit, {
      freshness: 'immediate',
      metersPerCell: map.metersPerCell,
    });
    assert.notEqual(exact, published, `immediate ${scalar} must not inherit coalesced suppression`);
    assert.equal(exact.knownThreats[0]?.[scalar], expectedCanonicalValue);
    assert.equal(exact.knowledgeRevision, unit.tacticalKnowledge.revision);
    assert.equal(Object.isFrozen(exact), true, 'published context must be immutable at runtime');
    assert.equal(Object.isFrozen(exact.knownThreats), true, 'published threat collection must be immutable at runtime');
    assert.equal(Object.isFrozen(exact.knownThreats[0]), true, 'published threat entries must be immutable at runtime');
  }
}

function verifyObserverDependentSnapshotIdentity(): void {
  clearUnitTacticalRouteContext(unit);
  const current = threat('unit:posture', 9.5, 3.5, true);
  unit.tacticalKnowledge.threats = [current];
  unit.tacticalKnowledge.revision = 200;
  unit.tacticalKnowledge.lastUpdatedSeconds = 20;
  unit.behaviorRuntime.posture = 'standing';

  const standing = buildUnitTacticalRouteContext(unit, {
    freshness: 'immediate',
    metersPerCell: map.metersPerCell,
  });
  const standingFields = getRouteCostFields(state.map, profile, standing, createRouteCostFieldCache());
  assert.equal(standing.posture, 'standing');
  assert.match(standingFields.dangerFieldKey, /^standing#/);

  unit.behaviorRuntime.posture = 'crouched';
  const crouched = buildUnitTacticalRouteContext(unit, {
    freshness: 'immediate',
    metersPerCell: map.metersPerCell,
  });
  const crouchedFields = getRouteCostFields(state.map, profile, crouched, createRouteCostFieldCache());
  assert.notEqual(crouched, standing, 'posture must invalidate the snapshot without a knowledge revision');
  assert.equal(crouched.posture, 'crouched');
  assert.match(crouchedFields.dangerFieldKey, /^crouched#/);

  unit.behaviorRuntime.posture = 'prone';
  const prone = buildUnitTacticalRouteContext(unit, {
    freshness: 'immediate',
    metersPerCell: map.metersPerCell,
  });
  const proneFields = getRouteCostFields(state.map, profile, prone, createRouteCostFieldCache());
  assert.notEqual(prone, crouched, 'each posture transition must publish a new snapshot');
  assert.equal(prone.posture, 'prone');
  assert.match(proneFields.dangerFieldKey, /^prone#/);

  const rescaled = buildUnitTacticalRouteContext(unit, {
    freshness: 'immediate',
    metersPerCell: 2,
  });
  assert.notEqual(rescaled, prone, 'metersPerCell must participate in snapshot identity');
  assert.equal(rescaled.knownThreats[0]?.rangeCells, 125);
  assert.equal(prone.knownThreats[0]?.rangeCells, 50);
}

function threat(id: string, x: number, y: number, visibleNow: boolean): KnownThreatMemory {
  return {
    id,
    labelRu: id,
    mode: 'directional_fire',
    x,
    y,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    strength: 70,
    suppression: 20,
    stressPerSecond: 2,
    directionDegrees: 180,
    arcDegrees: 90,
    rangeCells: 30,
    minRangeCells: 0,
    falloffPercent: 35,
    confidence: 80,
    uncertaintyCells: 0.5,
    source: visibleNow ? 'seen' : 'fire_pressure',
    visibleNow,
    lastSeenSeconds: visibleNow ? 1 : -1,
    lastUpdatedSeconds: 1,
    fireThreatClass: visibleNow ? 'rifle_fire' : null,
  };
}
