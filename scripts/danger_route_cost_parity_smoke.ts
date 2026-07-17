import assert from 'node:assert/strict';
import { buildCanonicalWorldThreatSet } from '../src/core/knowledge/CanonicalWorldThreat';
import { buildSoldierAwarenessReport } from '../src/core/knowledge/SoldierAwarenessGrid';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { buildUnitTacticalRouteContext } from '../src/core/navigation/NavigationRuntime';
import {
  createRouteCostFieldCache,
  getRouteCostFields,
} from '../src/core/navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../src/core/navigation/NavigationProfiles';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { KnownThreatMemory, UnitModel } from '../src/core/units/UnitModel';

type TestFireThreatClass = 'rifle_fire' | 'machine_gun_fire';
type ClassifiedThreat = KnownThreatMemory & { fireThreatClass?: TestFireThreatClass | null };

const mapData: TacticalMapData = {
  width: 16,
  height: 11,
  cellSize: 24,
  metersPerCell: 5,
  runtimeMetersPerCell: 5,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [{
    id: 'parity-wall',
    kind: 'structure',
    x: 8,
    y: 4,
    widthCells: 1,
    heightCells: 3,
    coverProtection: 92,
    coverReliability: 96,
    concealment: 70,
    penetrable: false,
    coverPosture: 'standing',
  }],
};

const state = createInitialState(mapData, [{
  id: 'blue-parity',
  label: 'Blue parity',
  labelRu: 'Синий parity',
  type: 'infantry_squad',
  side: 'blue',
  x: 5,
  y: 5,
}]);
const blue = requireUnit('blue-parity');
const profile = getBuiltInNavigationProfile('cautious');
const protectedCell = { x: 6, y: 5 };
const exposedCell = { x: 10, y: 5 };

setThreats([
  directionalThreat('unit:rifle-a', 13.5, 5.5, 82, 'rifle_fire'),
]);
const protectedReport = buildSoldierAwarenessReport(state, blue);
const protectedRoute = routeFields();
const protectedDanger = dangerAt(protectedReport, protectedCell.x, protectedCell.y);
const exposedDanger = dangerAt(protectedReport, exposedCell.x, exposedCell.y);
const protectedRouteDanger = routeDangerAt(protectedRoute, protectedCell.x, protectedCell.y);
const exposedRouteDanger = routeDangerAt(protectedRoute, exposedCell.x, exposedCell.y);

assert.ok(protectedDanger < exposedDanger, 'wall-protected cell must be safer in the canonical danger field');
assertClose(
  exposedRouteDanger,
  profile.dangerWeight * exposedDanger / 100,
  1e-6,
  'route dangerCost must be derived from the same final danger value as awareness',
);
assert.ok(
  protectedRouteDanger < exposedRouteDanger,
  'route dangerCost must preserve protection semantics instead of only cone geometry',
);

const target = exposedCell;
const rifleA = directionalThreat('unit:rifle-a', 13.5, 5.5, 70, 'rifle_fire');
const weakerRifle = directionalThreat('unit:rifle-b', 13.5, 5.5, 45, 'rifle_fire');
const strongerRifle = directionalThreat('unit:rifle-c', 13.5, 5.5, 92, 'rifle_fire');
const machineGunA = directionalThreat('unit:mg-a', 13.5, 5.5, 78, 'machine_gun_fire');
const weakerMachineGun = directionalThreat('unit:mg-b', 13.5, 5.5, 52, 'machine_gun_fire');

const rifleOnly = sample([rifleA], target);
const sameRiflePair = sample([rifleA, weakerRifle], target);
assertClose(sameRiflePair.danger, rifleOnly.danger, 1e-6, 'weaker rifle threat must not stack inside rifle_fire');
assertClose(sameRiflePair.routeDanger, rifleOnly.routeDanger, 1e-6, 'route cost must preserve rifle_fire max aggregation');

const strongerRifleOnly = sample([strongerRifle], target);
const strongerRiflePair = sample([rifleA, strongerRifle], target);
assertClose(strongerRiflePair.danger, strongerRifleOnly.danger, 1e-6, 'stronger rifle must replace the rifle_fire maximum');
assertClose(strongerRiflePair.routeDanger, strongerRifleOnly.routeDanger, 1e-6, 'route cost must use the stronger rifle maximum');

const machineGunOnly = sample([machineGunA], target);
const machineGunPair = sample([machineGunA, weakerMachineGun], target);
assertClose(machineGunPair.danger, machineGunOnly.danger, 1e-6, 'weaker machine gun must not stack inside machine_gun_fire');
assertClose(machineGunPair.routeDanger, machineGunOnly.routeDanger, 1e-6, 'route cost must preserve machine_gun_fire max aggregation');

const rifleAndMachineGun = sample([rifleA, machineGunA], target);
assert.ok(
  rifleAndMachineGun.danger > Math.max(rifleOnly.danger, machineGunOnly.danger),
  'rifle_fire and machine_gun_fire must remain independent categories',
);
assert.ok(
  rifleAndMachineGun.routeDanger > Math.max(rifleOnly.routeDanger, machineGunOnly.routeDanger),
  'route dangerCost must combine independent fire classes',
);

const unknownA = directionalThreat('unknown-fire:a', 13.5, 5.5, 66, null);
const unknownB = directionalThreat('unknown-fire:b', 13.5, 5.5, 54, null);
const unknownOnly = sample([unknownA], target);
const unknownPair = sample([unknownA, unknownB], target);
assert.ok(unknownPair.danger > unknownOnly.danger, 'independent unknown threats must not collapse into one maximum');
assert.ok(unknownPair.routeDanger > unknownOnly.routeDanger, 'route cost must preserve independent unknown threats');

console.log(JSON.stringify({
  smoke: 'danger-route-cost-parity',
  protected: { danger: protectedDanger, routeDanger: protectedRouteDanger },
  exposed: { danger: exposedDanger, routeDanger: exposedRouteDanger },
  sameClass: {
    rifle: [rifleOnly, sameRiflePair],
    machineGun: [machineGunOnly, machineGunPair],
  },
  differentClasses: rifleAndMachineGun,
  unknown: [unknownOnly, unknownPair],
}, null, 2));
console.log('Danger route cost parity smoke passed: routing consumes canonical protected danger, same fire classes use max, and independent classes remain combinable.');

function sample(threats: ClassifiedThreat[], cell: { x: number; y: number }): { danger: number; routeDanger: number } {
  setThreats(threats);
  const report = buildSoldierAwarenessReport(state, blue);
  const fields = routeFields();
  return {
    danger: dangerAt(report, cell.x, cell.y),
    routeDanger: routeDangerAt(fields, cell.x, cell.y),
  };
}

function setThreats(threats: ClassifiedThreat[]): void {
  blue.tacticalKnowledge.threats = [...buildCanonicalWorldThreatSet(
    threats,
    state.map.metersPerCell,
  ).threats];
  blue.tacticalKnowledge.revision += 1;
}

function routeFields(): ReturnType<typeof getRouteCostFields> {
  return getRouteCostFields(
    state.map,
    profile,
    buildUnitTacticalRouteContext(blue, { metersPerCell: state.map.metersPerCell }),
    createRouteCostFieldCache(),
  );
}

function dangerAt(report: ReturnType<typeof buildSoldierAwarenessReport>, x: number, y: number): number {
  const cell = report.cells[y * state.map.width + x];
  assert.ok(cell, `awareness cell ${x}:${y} must exist`);
  return cell.danger;
}

function routeDangerAt(fields: ReturnType<typeof getRouteCostFields>, x: number, y: number): number {
  return fields.dangerCost[y * fields.width + x] ?? 0;
}

function directionalThreat(
  id: string,
  x: number,
  y: number,
  strength: number,
  fireThreatClass: TestFireThreatClass | null,
): ClassifiedThreat {
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
    strength,
    suppression: 25,
    stressPerSecond: 5,
    directionDegrees: 180,
    arcDegrees: 150,
    rangeCells: 30,
    minRangeCells: 0,
    falloffPercent: 25,
    confidence: 90,
    uncertaintyCells: 0,
    source: id.startsWith('unknown-fire:') ? 'fire_pressure' : 'seen',
    visibleNow: id.startsWith('unit:'),
    lastSeenSeconds: id.startsWith('unit:') ? 0 : -1,
    lastUpdatedSeconds: 0,
    fireThreatClass,
  };
}

function requireUnit(id: string): UnitModel {
  const unit = state.units.find((candidate) => candidate.id === id);
  assert.ok(unit, `unit ${id} must exist`);
  return unit;
}

function assertClose(actual: number, expected: number, tolerance: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`,
  );
}
