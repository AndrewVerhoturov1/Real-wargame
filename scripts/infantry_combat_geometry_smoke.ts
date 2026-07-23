import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  POSTURE_MUZZLE_HEIGHT_METRES,
  computeMuzzleGeometry,
  evaluateCenterlineFriendlyFireRisk,
  evaluateMuzzleBlocked,
  equipPrimaryWeaponFromLoadout,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';

verifyPostureHeightOrderingAndForwardOffset();
verifyShooterDoesNotBlockOwnMuzzle();
verifyObjectImmediatelyBeforeMuzzleBlocks();
verifyFriendlyCenterlineRisk();
verifyFriendlyBehindTargetAndOffCenterlineAreClear();
verifyEnemyFirstDoesNotCountAsFriendlyRisk();

console.log('Infantry combat geometry smoke passed: posture muzzle heights, exact forward offset, muzzle blocking and centerline friendly-fire risk.');

function verifyPostureHeightOrderingAndForwardOffset(): void {
  const state = makeState([{ id: 'shooter', side: 'blue', x: 2, y: 2 }]);
  const shooter = equip(state.units[0]!);
  const weapon = shooter.infantryCombatRuntime.primaryWeapon!;
  const target = { xMetres: 40, yMetres: 5, zMetres: 1.35 };
  const heights: number[] = [];
  for (const posture of ['standing', 'crouched', 'prone'] as const) {
    shooter.behaviorRuntime.posture = posture;
    const geometry = computeMuzzleGeometry(state.map, shooter, target, weapon);
    assert.ok(geometry);
    heights.push(geometry.weaponAnchor.zMetres);
    assert.ok(Math.abs(distance(geometry.weaponAnchor, geometry.muzzle) - weapon.resolved.weapon.muzzleForwardOffsetMeters) < 1e-9);
    assert.equal(shooter.facingRadians, 0);
  }
  assert.deepEqual(POSTURE_MUZZLE_HEIGHT_METRES, { standing: 1.35, crouched: 0.92, prone: 0.3 });
  assert.ok(heights[0]! > heights[1]! && heights[1]! > heights[2]!);
}

function verifyShooterDoesNotBlockOwnMuzzle(): void {
  const state = makeState([{ id: 'shooter-own-body', side: 'blue', x: 2, y: 2 }]);
  const shooter = equip(state.units[0]!);
  const geometry = computeMuzzleGeometry(state.map, shooter, { xMetres: 30, yMetres: 5, zMetres: 1.35 }, shooter.infantryCombatRuntime.primaryWeapon!);
  assert.ok(geometry);
  const result = evaluateMuzzleBlocked(state, shooter, geometry);
  assert.equal(result.blocked, false);
  assert.equal(result.blockedBy, null);
}

function verifyObjectImmediatelyBeforeMuzzleBlocks(): void {
  const state = makeState(
    [{ id: 'shooter-wall', side: 'blue', x: 2, y: 2 }],
    [{
      id: 'thin-wall',
      kind: 'structure',
      x: 2.25,
      y: 2,
      widthCells: 0.2,
      heightCells: 0.2,
      losHeightMeters: 2,
    }],
  );
  const shooter = equip(state.units[0]!);
  const geometry = computeMuzzleGeometry(state.map, shooter, { xMetres: 30, yMetres: 5, zMetres: 1.35 }, shooter.infantryCombatRuntime.primaryWeapon!);
  assert.ok(geometry);
  const result = evaluateMuzzleBlocked(state, shooter, geometry);
  assert.equal(result.blocked, true);
  assert.equal(result.blockedBy, 'map_object');
  assert.equal(result.obstructionId, 'thin-wall');
}

function verifyFriendlyCenterlineRisk(): void {
  const state = makeState([
    { id: 'shooter-friendly', side: 'blue', x: 2, y: 2 },
    { id: 'friendly-line', side: 'blue', x: 5, y: 2 },
  ]);
  const shooter = equip(state.units[0]!);
  const geometry = computeMuzzleGeometry(state.map, shooter, { xMetres: 30, yMetres: 5, zMetres: 1.35 }, shooter.infantryCombatRuntime.primaryWeapon!);
  assert.ok(geometry);
  const risk = evaluateCenterlineFriendlyFireRisk(state, shooter, geometry.muzzle, geometry.target);
  assert.equal(risk.risk, 1);
  assert.equal(risk.firstUnitId, 'friendly-line');
  assert.equal(risk.firstUnitFriendly, true);
}

function verifyFriendlyBehindTargetAndOffCenterlineAreClear(): void {
  const behind = makeState([
    { id: 'shooter-behind', side: 'blue', x: 2, y: 2 },
    { id: 'friendly-behind', side: 'blue', x: 15, y: 2 },
  ]);
  const shooterBehind = equip(behind.units[0]!);
  const behindGeometry = computeMuzzleGeometry(behind.map, shooterBehind, { xMetres: 20, yMetres: 5, zMetres: 1.35 }, shooterBehind.infantryCombatRuntime.primaryWeapon!);
  assert.ok(behindGeometry);
  assert.equal(evaluateCenterlineFriendlyFireRisk(behind, shooterBehind, behindGeometry.muzzle, behindGeometry.target).risk, 0);

  const offLine = makeState([
    { id: 'shooter-off', side: 'blue', x: 2, y: 2 },
    { id: 'friendly-off', side: 'blue', x: 5, y: 3 },
  ]);
  const shooterOff = equip(offLine.units[0]!);
  const offGeometry = computeMuzzleGeometry(offLine.map, shooterOff, { xMetres: 30, yMetres: 5, zMetres: 1.35 }, shooterOff.infantryCombatRuntime.primaryWeapon!);
  assert.ok(offGeometry);
  assert.equal(evaluateCenterlineFriendlyFireRisk(offLine, shooterOff, offGeometry.muzzle, offGeometry.target).risk, 0);
}

function verifyEnemyFirstDoesNotCountAsFriendlyRisk(): void {
  const state = makeState([
    { id: 'shooter-enemy', side: 'blue', x: 2, y: 2 },
    { id: 'enemy-first', side: 'red', x: 5, y: 2 },
    { id: 'friendly-second', side: 'blue', x: 7, y: 2 },
  ]);
  const shooter = equip(state.units[0]!);
  const geometry = computeMuzzleGeometry(state.map, shooter, { xMetres: 30, yMetres: 5, zMetres: 1.35 }, shooter.infantryCombatRuntime.primaryWeapon!);
  assert.ok(geometry);
  const risk = evaluateCenterlineFriendlyFireRisk(state, shooter, geometry.muzzle, geometry.target);
  assert.equal(risk.risk, 0);
  assert.equal(risk.firstUnitId, 'enemy-first');
  assert.equal(risk.firstUnitFriendly, false);
}

function makeState(
  units: Array<{ id: string; side: 'blue' | 'red'; x: number; y: number }>,
  objects: Array<Record<string, unknown>> = [],
): SimulationState {
  return createInitialState({
    width: 30,
    height: 10,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: objects as never,
  }, units.map((unit) => ({ ...unit, type: 'infantry_squad' })));
}

function equip(unit: UnitModel): UnitModel {
  const result = equipPrimaryWeaponFromLoadout(unit, createDefaultCombatCatalogRegistry(), {
    definitionId: 'loadout_rifleman',
    revision: 1,
  });
  assert.equal(result.ok, true);
  return unit;
}

function distance(left: { xMetres: number; yMetres: number; zMetres: number }, right: { xMetres: number; yMetres: number; zMetres: number }): number {
  return Math.hypot(right.xMetres - left.xMetres, right.yMetres - left.yMetres, right.zMetres - left.zMetres);
}
