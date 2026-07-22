import assert from 'node:assert/strict';
import {
  createBallisticLineProbeContext,
  probeBallisticLine,
} from '../src/core/combat/BallisticLineProbe';
import { traceProjectile } from '../src/core/combat/BallisticRaycast';
import { getCombatEventHistory } from '../src/core/combat/CombatEvents';
import { getWeaponRuntime } from '../src/core/combat/WeaponModel';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { TacticalMapData } from '../src/core/map/MapModel';
import type { UnitData } from '../src/core/units/UnitModel';

const openState = makeState([], []);
const openRequest = line(2.5, 3.5, 12.5, 3.5, 1.2);
const openContext = createBallisticLineProbeContext(openState);
const open = probeBallisticLine(openContext, openRequest);
assert.equal(open.clear, true);
assert.equal(open.blockedBy, null);
assert.ok(open.clearanceMetres !== null && open.clearanceMetres > 0);
assert.deepEqual(probeBallisticLine(openContext, openRequest), open, 'identical probes must be deterministic');

const wallState = makeState([
  { id: 'wall', kind: 'structure', x: 6, y: 3, widthCells: 2, heightCells: 2, losHeightMeters: 2.5 },
], []);
const wallRequest = line(2.5, 3.5, 12.5, 3.5, 1.2);
const wallProbe = probeBallisticLine(createBallisticLineProbeContext(wallState), wallRequest);
assert.equal(wallProbe.clear, false);
assert.equal(wallProbe.blockedBy, 'map_object');
assert.equal(wallProbe.obstructionId, 'wall');

const hillState = makeState([], [], [{ x1: 6, x2: 8, y1: 2, y2: 4, height: 2 }]);
const hillProbe = probeBallisticLine(createBallisticLineProbeContext(hillState), line(2.5, 3.5, 12.5, 3.5, 1.4));
assert.equal(hillProbe.clear, false);
assert.equal(hillProbe.blockedBy, 'terrain');

const unitState = makeState([], [unit('target', 7, 3)]);
const unitProbe = probeBallisticLine(createBallisticLineProbeContext(unitState), line(2.5, 3.5, 12.5, 3.5, 1.1));
assert.equal(unitProbe.blockedBy, 'unit');
assert.equal(unitProbe.obstructionId, 'target');
unitState.units[0]!.behaviorRuntime.posture = 'prone';
const aboveProne = probeBallisticLine(createBallisticLineProbeContext(unitState), line(2.5, 3.5, 12.5, 3.5, 1.1));
assert.notEqual(aboveProne.obstructionId, 'target', 'unit hit geometry must use the current physical posture');
const throughProne = probeBallisticLine(createBallisticLineProbeContext(unitState), line(2.5, 3.5, 12.5, 3.5, 0.3));
assert.equal(throughProne.obstructionId, 'target');

const rangeProbe = probeBallisticLine(createBallisticLineProbeContext(openState), {
  ...openRequest,
  maximumDistanceMetres: 5,
});
assert.equal(rangeProbe.blockedBy, 'range');
assert.equal(rangeProbe.hitDistanceMetres, 5);

const sideEffectState = makeState([], [unit('shooter', 2, 3), unit('target', 9, 3)]);
const shooter = sideEffectState.units[0]!;
const target = sideEffectState.units[1]!;
const ammoBefore = getWeaponRuntime(shooter).roundsLoaded;
const eventsBefore = getCombatEventHistory(sideEffectState);
const serializableBefore = JSON.parse(JSON.stringify(sideEffectState));
const probeRequest = line(
  shooter.position.x,
  shooter.position.y,
  target.position.x,
  target.position.y,
  1.1,
  shooter.id,
);
const sideEffectProbe = probeBallisticLine(createBallisticLineProbeContext(sideEffectState), probeRequest);
assert.equal(sideEffectProbe.obstructionId, target.id);
assert.equal(getWeaponRuntime(shooter).roundsLoaded, ammoBefore, 'probe must not consume ammunition');
assert.deepEqual(getCombatEventHistory(sideEffectState), eventsBefore, 'probe must not create combat events');
assert.deepEqual(JSON.parse(JSON.stringify(sideEffectState)), serializableBefore, 'probe must not mutate simulation state');

const probeState = makeState([
  { id: 'agreement-wall', kind: 'structure', x: 6, y: 3, widthCells: 2, heightCells: 2, losHeightMeters: 2.5 },
], []);
const realState = makeState([
  { id: 'agreement-wall', kind: 'structure', x: 6, y: 3, widthCells: 2, heightCells: 2, losHeightMeters: 2.5 },
], []);
const agreementRequest = line(2.5, 3.5, 12.5, 3.5, 1.2);
const agreementProbe = probeBallisticLine(createBallisticLineProbeContext(probeState), agreementRequest);
const dx = agreementRequest.target.xMetres - agreementRequest.origin.xMetres;
const dy = agreementRequest.target.yMetres - agreementRequest.origin.yMetres;
const dz = agreementRequest.target.zMetres - agreementRequest.origin.zMetres;
const distance = Math.hypot(dx, dy, dz);
const real = traceProjectile(realState, {
  shotId: 'agreement-real-shot',
  shooterId: 'none',
  origin: agreementRequest.origin,
  direction: { x: dx / distance, y: dy / distance, z: dz / distance },
  maximumDistanceMetres: distance,
  muzzleVelocityMetresPerSecond: 800,
});
assert.equal(real.hitType, 'object');
assert.equal(real.hitObjectId, agreementProbe.obstructionId);
assert.ok(Math.abs(real.travelledMetres - (agreementProbe.hitDistanceMetres ?? -1)) < 1e-6);

const timeIndependentState = makeState([], []);
timeIndependentState.simulationTimeSeconds = 1;
const firstTimeResult = probeBallisticLine(createBallisticLineProbeContext(timeIndependentState), openRequest);
timeIndependentState.simulationTimeSeconds = 1000;
const secondTimeResult = probeBallisticLine(createBallisticLineProbeContext(timeIndependentState), openRequest);
assert.deepEqual(secondTimeResult, firstTimeResult, 'probe must not depend on simulation tick or time');

console.log('Ballistic line probe smoke passed.');

function makeState(
  objects: NonNullable<TacticalMapData['objects']>,
  units: UnitData[],
  cellRects: NonNullable<TacticalMapData['cellRects']> = [],
) {
  return createInitialState({
    width: 20,
    height: 10,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects,
    cellRects,
  }, units);
}

function unit(id: string, x: number, y: number): UnitData {
  return {
    id,
    label: id,
    labelRu: id,
    type: 'infantry_squad',
    side: id === 'shooter' ? 'blue' : 'red',
    x,
    y,
    facingDegrees: id === 'shooter' ? 0 : 180,
    runtime: { ammo: 5, weaponReady: true },
  };
}

function line(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  zMetres: number,
  shooterId?: string,
) {
  const metresPerCell = 2;
  return {
    origin: { xMetres: startX * metresPerCell, yMetres: startY * metresPerCell, zMetres },
    target: { xMetres: endX * metresPerCell, yMetres: endY * metresPerCell, zMetres },
    shooterId,
  };
}
