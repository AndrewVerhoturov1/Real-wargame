import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickAllUnitPerception } from '../src/core/perception/PerceptionSystem';
import { areUnitsHostile, getSideRelation } from '../src/core/units/SideRelations';
import {
  DEFAULT_RIFLE_ID,
  getWeaponRuntime,
  reloadWeapon,
  tryConsumeRound,
} from '../src/core/combat/WeaponModel';
import { getUnitHitShapes, intersectRayWithUnitHitShapes } from '../src/core/combat/UnitHitShapes';
import { traceProjectile } from '../src/core/combat/BallisticRaycast';
import { applyUnitHit, getCombatRuntime, isUnitCombatCapable } from '../src/core/combat/CombatDamage';
import {
  getFireAction,
  requestFireAction,
  tickFireAction,
} from '../src/core/combat/FireAction';

function makeState() {
  return createInitialState(
    {
      width: 20,
      height: 12,
      cellSize: 16,
      metersPerCell: 2,
      runtimeMetersPerCell: 2,
      defaultTerrain: 'field',
      defaultHeight: 0,
      objects: [],
    },
    [
      {
        id: 'blue-1',
        label: 'Blue rifleman',
        labelRu: 'Синий стрелок',
        type: 'infantry_squad',
        side: 'blue',
        x: 3,
        y: 5,
        facingDegrees: 0,
        viewRangeCells: 20,
        runtime: { ammo: 5, weaponReady: true },
      },
      {
        id: 'red-1',
        label: 'Red rifleman',
        labelRu: 'Красный стрелок',
        type: 'infantry_squad',
        side: 'red',
        x: 8,
        y: 5,
        facingDegrees: 180,
        viewRangeCells: 20,
        runtime: { ammo: 5, weaponReady: true },
      },
    ],
  );
}

function verifySides(): void {
  const state = makeState();
  const blue = state.units[0];
  const red = state.units[1];
  assert.deepEqual(state.units.map((unit) => unit.side), ['blue', 'red']);
  assert.equal(getSideRelation(blue.side, blue.side), 'friendly');
  assert.equal(getSideRelation(blue.side, red.side), 'hostile');
  assert.equal(areUnitsHostile(blue, red), true);
}

function verifyAllUnitPerception(): void {
  const state = makeState();
  state.selectedUnitId = null;
  state.selectedUnitIds = [];
  for (let index = 0; index < 80; index += 1) {
    state.simulationTimeSeconds += 0.1;
    tickAllUnitPerception(state, 0.1);
  }
  const blueContact = state.units[0].perceptionKnowledge.contacts.find((item) => item.sourceUnitId === 'red-1');
  const redContact = state.units[1].perceptionKnowledge.contacts.find((item) => item.sourceUnitId === 'blue-1');
  assert.ok(blueContact, 'blue unit must perceive the real red unit without being selected');
  assert.ok(redContact, 'red unit must perceive the real blue unit without being selected');
  assert.notEqual(blueContact, redContact, 'each observer must retain independent subjective contact memory');
}

function verifyWeaponRuntime(): void {
  const state = makeState();
  const weapon = getWeaponRuntime(state.units[0]);
  assert.equal(weapon.weaponId, DEFAULT_RIFLE_ID);
  assert.equal(weapon.roundsLoaded, 5);
  assert.equal(tryConsumeRound(state.units[0], 0), true);
  assert.equal(getWeaponRuntime(state.units[0]).roundsLoaded, 4);
  getWeaponRuntime(state.units[0]).roundsReserve = 3;
  getWeaponRuntime(state.units[0]).roundsLoaded = 0;
  assert.equal(reloadWeapon(state.units[0]), 3);
  assert.equal(getWeaponRuntime(state.units[0]).roundsLoaded, 3);
  assert.equal(getWeaponRuntime(state.units[0]).roundsReserve, 0);
}

function verifyHitShapes(): void {
  const state = makeState();
  const target = state.units[1];
  const standing = getUnitHitShapes(target, state.map);
  assert.ok(standing.some((shape) => shape.zone === 'head'));
  assert.ok(standing.some((shape) => shape.zone === 'torso'));
  target.behaviorRuntime.posture = 'prone';
  target.facingRadians = Math.PI / 2;
  const prone = getUnitHitShapes(target, state.map);
  assert.ok(Math.max(...prone.map((shape) => shape.centerYMetres)) - Math.min(...prone.map((shape) => shape.centerYMetres)) > 0.5);
  const hit = intersectRayWithUnitHitShapes(
    { xMetres: target.position.x * state.map.metersPerCell, yMetres: (target.position.y - 4) * state.map.metersPerCell, zMetres: 0.3 },
    { x: 0, y: 1, z: 0 },
    20,
    target,
    state.map,
  );
  assert.ok(hit, 'ray through the oriented prone silhouette must hit a body zone');
}

function verifyBallistics(): void {
  const state = makeState();
  const blue = state.units[0];
  const red = state.units[1];
  const origin = {
    xMetres: blue.position.x * state.map.metersPerCell,
    yMetres: blue.position.y * state.map.metersPerCell,
    zMetres: 1.45,
  };
  const target = {
    xMetres: red.position.x * state.map.metersPerCell,
    yMetres: red.position.y * state.map.metersPerCell,
    zMetres: 1.1,
  };
  const length = Math.hypot(target.xMetres - origin.xMetres, target.yMetres - origin.yMetres, target.zMetres - origin.zMetres);
  const result = traceProjectile(state, {
    shotId: 'ballistic-test',
    shooterId: blue.id,
    origin,
    direction: {
      x: (target.xMetres - origin.xMetres) / length,
      y: (target.yMetres - origin.yMetres) / length,
      z: (target.zMetres - origin.zMetres) / length,
    },
    maximumDistanceMetres: 100,
    muzzleVelocityMetresPerSecond: 800,
  });
  assert.equal(result.hitType, 'unit');
  assert.equal(result.hitUnitId, red.id);
}

function verifyDamage(): void {
  const state = makeState();
  const red = state.units[1];
  const result = applyUnitHit(red, { shotId: 'head-test', zone: 'head', energyJoules: 3000 });
  assert.ok(result.capability === 'incapacitated' || result.capability === 'dead');
  assert.equal(isUnitCombatCapable(red), false);
  assert.equal(getCombatRuntime(red).lastHit?.zone, 'head');
}

function verifyStatefulFire(): void {
  const state = makeState();
  for (let index = 0; index < 100; index += 1) {
    state.simulationTimeSeconds += 0.1;
    tickAllUnitPerception(state, 0.1);
  }
  const blue = state.units[0];
  const red = state.units[1];
  const contact = blue.perceptionKnowledge.contacts.find((item) => item.sourceUnitId === red.id);
  assert.ok(contact);
  assert.equal(requestFireAction(state, blue, contact.id), true);
  const phases = new Set<string>();
  for (let index = 0; index < 100 && getFireAction(blue); index += 1) {
    phases.add(getFireAction(blue)?.phase ?? 'none');
    state.simulationTimeSeconds += 0.05;
    tickFireAction(state, blue, 0.05);
  }
  assert.ok(phases.has('turning') || phases.has('readying_weapon'));
  assert.ok(phases.has('aiming'));
  assert.ok(phases.has('firing'));
  assert.ok(getWeaponRuntime(blue).roundsLoaded < 5, 'round must be consumed only by the real firing phase');
  assert.ok(getCombatRuntime(red).lastHit || getFireAction(blue) === null, 'fire action must resolve without hanging');
}

verifySides();
verifyAllUnitPerception();
verifyWeaponRuntime();
verifyHitShapes();
verifyBallistics();
verifyDamage();
verifyStatefulFire();

console.log('Combat foundation smoke passed.');
