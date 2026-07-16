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

movingThreat.x = 7.9;
unit.tacticalKnowledge.revision = 4;
unit.tacticalKnowledge.lastUpdatedSeconds = 1.56;
const immediate = buildUnitTacticalRouteContext(unit, {
  freshness: 'immediate',
  metersPerCell: map.metersPerCell,
});
assert.notEqual(immediate, elapsed, 'initial order planning must be able to request the current snapshot immediately');
assert.equal(immediate.knownThreats[0].x, 7.5);

const addedThreat = threat('unknown-fire:new', 7.5, 6.5, false);
unit.tacticalKnowledge.threats.push(addedThreat);
unit.tacticalKnowledge.revision = 5;
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

clearUnitTacticalRouteContext(unit);
assert.notEqual(buildUnitTacticalRouteContext(unit, {
  freshness: 'coalesced',
  metersPerCell: map.metersPerCell,
}), topologyChange, 'explicit reset must discard the cached snapshot');

console.log('Tactical snapshot coalescing smoke passed: movement is time-bounded while orders and topology changes remain immediate.');

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
