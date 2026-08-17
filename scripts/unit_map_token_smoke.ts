import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';
import { normalizeUnits, type UnitModel } from '../src/core/units/UnitModel';
import { PixiUnitRenderer, resolveUnitRendererLod } from '../src/rendering/PixiUnitRenderer';

const map = normalizeMap({
  width: 12,
  height: 8,
  cellSize: 24,
  metersPerCell: 2,
  defaultTerrain: 'field',
});

const units = normalizeUnits([
  { id: 'standing', labelRu: 'Стоя', type: 'infantry_squad', side: 'blue', x: 2, y: 2, heldItem: 'long_item', facingDegrees: 30 },
  { id: 'crouched', labelRu: 'Пригнувшись', type: 'scout_team', side: 'blue', x: 4, y: 2, heldItem: 'short_item', facingDegrees: 90 },
  { id: 'prone', labelRu: 'Лёжа', type: 'infantry_squad', side: 'red', x: 6, y: 2, heldItem: 'long_item', facingDegrees: 180 },
  { id: 'dead', labelRu: 'Погиб', type: 'infantry_squad', side: 'red', x: 8, y: 2, heldItem: 'long_item', facingDegrees: 270 },
  { id: 'support', labelRu: 'Поддержка', type: 'support_team', side: 'blue', x: 5, y: 5, heldItem: 'support_item', facingDegrees: 0 },
]);

unitById(units, 'standing').behaviorRuntime.posture = 'standing';
unitById(units, 'crouched').behaviorRuntime.posture = 'crouched';
unitById(units, 'prone').behaviorRuntime.posture = 'prone';
unitById(units, 'dead').behaviorRuntime.posture = 'standing';
unitById(units, 'dead').infantryCombatRuntime.wounds.capabilities = {
  ...unitById(units, 'dead').infantryCombatRuntime.wounds.capabilities,
  alive: false,
  conscious: false,
  canStand: false,
  canMove: false,
  canUseHands: false,
  canUseWeapon: false,
};

const wounded = unitById(units, 'prone');
wounded.infantryCombatRuntime.wounds.slots = [{ severity: 'light' } as never];
wounded.infantryCombatRuntime.suppression.suppressionLevel = 0.6;
wounded.movementRuntime.isMoving = true;
wounded.movementRuntime.actualGait = 'sprint';

const renderer = new PixiUnitRenderer();
renderer.render(map, units, ['standing'], 1.5);

assert.equal(renderer.getDiagnostics().viewCount, units.length);
assert.equal(renderer.getViewDiagnostics('standing')?.lod, 'near');
assert.equal(renderer.getViewDiagnostics('standing')?.shape, 'circle');
assert.equal(renderer.getViewDiagnostics('crouched')?.shape, 'rounded-triangle');
assert.equal(renderer.getViewDiagnostics('prone')?.shape, 'rounded-rectangle');
assert.equal(renderer.getViewDiagnostics('dead')?.shape, 'death');
assert.equal(renderer.getViewDiagnostics('dead')?.deathVisible, true);
assert.equal(renderer.getViewDiagnostics('dead')?.weaponVisible, false);
assert.equal(renderer.getViewDiagnostics('prone')?.woundVisible, true);
assert.equal(renderer.getViewDiagnostics('prone')?.suppressionVisible, true);
assert.equal(renderer.getViewDiagnostics('prone')?.movementMarkerCount, 2);
assert.equal(renderer.getViewDiagnostics('standing')?.selected, true);
assert.equal(renderer.getViewDiagnostics('crouched')?.selected, false);

const unchangedGeometry = renderer.getDiagnostics().geometryRebuildCount;
renderer.render(map, units, ['standing'], 1.5);
assert.equal(
  renderer.getDiagnostics().geometryRebuildCount,
  unchangedGeometry,
  'unchanged units must reuse persistent geometry',
);

const standing = unitById(units, 'standing');
const crouched = unitById(units, 'crouched');
const standingBefore = renderer.getViewDiagnostics('standing')!.geometryRebuildCount;
const crouchedBefore = renderer.getViewDiagnostics('crouched')!.geometryRebuildCount;
standing.behaviorRuntime.posture = 'crouched';
renderer.render(map, units, ['standing'], 1.5);
assert.ok(renderer.getViewDiagnostics('standing')!.geometryRebuildCount > standingBefore);
assert.equal(
  renderer.getViewDiagnostics('crouched')!.geometryRebuildCount,
  crouchedBefore,
  'one posture change must not rebuild another unit view',
);

const selectionTruthBefore = JSON.stringify({
  side: standing.side,
  posture: standing.behaviorRuntime.posture,
  facingRadians: standing.facingRadians,
  currentAction: standing.behaviorRuntime.currentAction,
});
renderer.render(map, units, [], 1.5);
assert.equal(renderer.getViewDiagnostics('standing')?.selected, false);
assert.equal(JSON.stringify({
  side: standing.side,
  posture: standing.behaviorRuntime.posture,
  facingRadians: standing.facingRadians,
  currentAction: standing.behaviorRuntime.currentAction,
}), selectionTruthBefore, 'selection is presentation only');

standing.facingRadians = Math.PI / 6;
standing.infantryCombatRuntime.activeFireTask = fireTask('aiming', null, 0, 1);
renderer.render(map, units, [], 1.5);
assert.ok(Math.abs(renderer.getViewDiagnostics('standing')!.weaponRotation - Math.PI / 2) < 1e-9);
assert.equal(renderer.getViewDiagnostics('standing')?.aimCueVisible, true);

standing.infantryCombatRuntime.activeFireTask = null;
renderer.render(map, units, [], 1.5);
assert.ok(Math.abs(renderer.getViewDiagnostics('standing')!.weaponRotation - standing.facingRadians) < 1e-9);

standing.infantryCombatRuntime.activeFireTask = fireTask('firing', 'shot-1', 1, 0);
renderer.render(map, units, [], 1.5);
assert.equal(renderer.getViewDiagnostics('standing')?.muzzleFlashVisible, true, 'new committed shot emits one render-frame flash');
renderer.render(map, units, [], 1.5);
assert.equal(renderer.getViewDiagnostics('standing')?.muzzleFlashVisible, false, 'stale shot id must not keep flashing');
standing.infantryCombatRuntime.activeFireTask = fireTask('firing', 'shot-2', 1, 0);
renderer.render(map, units, [], 1.5);
assert.equal(renderer.getViewDiagnostics('standing')?.muzzleFlashVisible, true);

const createdBeforeLod = renderer.getDiagnostics().creationCount;
renderer.render(map, units, [], 1.2);
assert.equal(renderer.getViewDiagnostics('standing')?.lod, 'medium');
assert.equal(renderer.getDiagnostics().creationCount, createdBeforeLod, 'LOD transition must reuse the same unit views');
renderer.render(map, units, [], 0.6);
assert.equal(renderer.getViewDiagnostics('standing')?.lod, 'far');
assert.equal(renderer.getViewDiagnostics('support')?.shape, 'square');
assert.equal(renderer.getViewDiagnostics('standing')?.weaponVisible, false);
assert.equal(renderer.getViewDiagnostics('prone')?.woundVisible, false);
assert.equal(renderer.getViewDiagnostics('prone')?.suppressionVisible, false);

assert.equal(resolveUnitRendererLod(0.7), 'far');
assert.equal(resolveUnitRendererLod(1), 'medium');
assert.equal(resolveUnitRendererLod(1.5), 'near');
assert.equal(resolveUnitRendererLod(0.72, 'far'), 'far', 'far LOD hysteresis must resist tiny zoom changes');
assert.equal(resolveUnitRendererLod(1.3, 'near'), 'near', 'near LOD hysteresis must resist tiny zoom changes');

const removalBefore = renderer.getDiagnostics().removalCount;
renderer.render(map, units.slice(0, 2), [], 0.6);
assert.equal(renderer.getDiagnostics().viewCount, 2);
assert.equal(renderer.getDiagnostics().removalCount, removalBefore + 3);

renderer.destroy();
assert.equal(renderer.getDiagnostics().viewCount, 0);

console.log('Unit map token smoke passed: accepted shapes, three LODs, live aim/fire state, selection projection, bounded rebuilds and teardown.');

function unitById(values: UnitModel[], id: string): UnitModel {
  const unit = values.find((candidate) => candidate.id === id);
  assert.ok(unit, `Missing unit ${id}`);
  return unit;
}

function fireTask(
  phase: 'aiming' | 'firing',
  committedShotId: string | null,
  directionX: number,
  directionY: number,
): NonNullable<UnitModel['infantryCombatRuntime']['activeFireTask']> {
  return {
    phase,
    committedShotId,
    aimTracking: {
      solution: {
        valid: true,
        currentDirection: { x: directionX, y: directionY, z: 0 },
      },
    },
  } as unknown as NonNullable<UnitModel['infantryCombatRuntime']['activeFireTask']>;
}
