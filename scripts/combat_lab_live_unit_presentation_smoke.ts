import assert from 'node:assert/strict';
import { CombatLabVisualSession } from '../src/combat-lab/runtime/CombatLabVisualSession';
import { buildCombatLabLiveUnitSnapshot } from '../src/combat-lab/ui/CombatLabLiveUnitPresentation';

const session = new CombatLabVisualSession('rifle-distance-baseline', 9041);
const shooter = session.state.units.find((unit) => unit.id === 'rifle-distance-shooter');
assert.ok(shooter, 'Expected rifle-distance-shooter in the built-in scenario.');

const initial = buildCombatLabLiveUnitSnapshot(shooter, { roleLabelRu: 'Стрелок' });
assert.equal(initial.unitId, shooter.id);
assert.equal(initial.roleLabelRu, 'Стрелок');
assert.equal(initial.posture, shooter.behaviorRuntime.posture);
assert.equal(initial.health, shooter.soldier.condition.health);
assert.equal(initial.morale, shooter.soldier.condition.morale);
assert.equal(initial.suppression, shooter.behaviorRuntime.suppression);
assert.equal(initial.fatigue, shooter.infantryCombatRuntime.physiology.fatigue.fatigue);
assert.ok(initial.capabilityLabelRu.length > 0);
assert.ok(initial.currentAction.labelRu.length > 0);
assert.ok(initial.weaponReadiness.labelRu.length > 0);
assert.ok(Array.isArray(initial.profileLinks));

const primaryWeapon = shooter.infantryCombatRuntime.primaryWeapon;
assert.ok(primaryWeapon, 'Expected the rifle scenario shooter to own a real infantry-combat weapon.');
assert.equal(initial.weapon?.roundsLoaded, primaryWeapon.roundsInWeapon);
assert.equal(initial.weapon?.magazineCapacity, primaryWeapon.resolved.weapon.capacityRounds);
assert.equal(initial.weapon?.weaponLabelRu, primaryWeapon.resolved.weapon.nameRu);

const originalPrimaryWeapon = shooter.infantryCombatRuntime.primaryWeapon;
shooter.infantryCombatRuntime.primaryWeapon = null;
const withoutWeapon = buildCombatLabLiveUnitSnapshot(shooter, { roleLabelRu: 'Стрелок' });
assert.equal(withoutWeapon.weapon, null, 'Presentation must not synthesize a fallback weapon.');
assert.equal(withoutWeapon.weaponReadiness.kind, 'no_weapon');
shooter.infantryCombatRuntime.primaryWeapon = originalPrimaryWeapon;

const targetPosture = shooter.behaviorRuntime.posture === 'standing' ? 'crouched' : 'standing';
const result = session.executeInteractive({ kind: 'posture', unitId: shooter.id, targetPosture });
assert.equal(result.accepted, true, result.reasonRu);

const during = buildCombatLabLiveUnitSnapshot(shooter, { roleLabelRu: 'Стрелок' });
assert.equal(during.currentAction.kind, 'posture_transition');
assert.notEqual(
  during.posture,
  targetPosture,
  'Accepted posture command must not optimistically replace the effective posture before simulation completes.',
);

let completed = false;
for (let step = 0; step < 300; step += 1) {
  session.stepOnce();
  const snapshot = buildCombatLabLiveUnitSnapshot(shooter, { roleLabelRu: 'Стрелок' });
  if (snapshot.posture === targetPosture) {
    completed = true;
    break;
  }
}
assert.equal(completed, true, 'Expected the real simulation to complete the posture transition.');

const after = buildCombatLabLiveUnitSnapshot(shooter, { roleLabelRu: 'Стрелок' });
assert.equal(after.posture, targetPosture);
assert.equal(after.unitId, shooter.id);

console.log('Combat Lab LIVE Unit presentation smoke passed.');
