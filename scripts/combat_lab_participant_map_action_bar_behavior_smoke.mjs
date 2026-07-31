import assert from 'node:assert/strict';
import { loadTypescriptModule } from './combat_lab_participant_test_support.mjs';
import {
  FakeEvent,
  findButton,
  findElement,
  installCombatLabBehaviorDom,
  walkElements,
} from './combat_lab_dom_behavior_test_support.mjs';

const { document, window } = installCombatLabBehaviorDom();
const coordinatorModule = loadTypescriptModule('src/combat-lab/map-tools/CombatLabMapToolCoordinator.ts');
const controllerModule = loadTypescriptModule('src/combat-lab/editor/CombatLabParticipantMapInteractionController.ts');

const root = document.createElement('div');
const canvas = document.createElement('canvas');
root.append(canvas);
document.body.append(root);
const mapTools = coordinatorModule.CombatLabMapToolCoordinator.create({
  initialPersistentMode: 'program_authoring',
  eventTarget: window,
});
let mutations = 0;
const patches = [];
const services = {
  mapTools,
  participantMutations: {
    update: (_roleId, callback) => {
      mutations += 1;
      const result = callback({ initial: { x: 1, y: 2, facingDegrees: 0 } });
      patches.push(result.scenePatch);
      return {};
    },
  },
};
const state = {
  map: { width: 64, height: 64, metersPerCell: 2 },
  mouseGridPosition: { x: 3.5, y: 2.5 },
};
const controller = controllerModule.CombatLabParticipantMapInteractionController.create({
  root,
  canvas,
  state,
  services,
});

controller.beginPlacement({ roleId: 'role-a', initialX: 1, initialY: 2 });
let actionBar = visibleActionBar(root);
assert.ok(actionBar, 'Placement must expose an on-screen action bar.');
assert.match(actionBar.textContent, /Размещение бойца/);
mapTools.preview({ xMetres: 8, yMetres: 6 });
assert.equal(mutations, 0, 'Preview must not mutate the experiment.');
findButton(actionBar, 'Подтвердить').click();
assert.equal(mutations, 1, 'Screen confirm must publish exactly one coordinator-owned mutation.');
assert.deepEqual(patches.at(-1), { x: 3.5, y: 2.5 });
assert.equal(visibleActionBar(root), null, 'Action bar must disappear after confirm.');

controller.beginFacing({ roleId: 'role-a', x: 3.5, y: 2.5, facingDegrees: 90 });
actionBar = visibleActionBar(root);
assert.ok(actionBar, 'Facing must expose the same action bar.');
assert.match(actionBar.textContent, /Направление бойца/);
findButton(actionBar, 'Отменить').click();
assert.equal(mutations, 1, 'Screen cancel must not publish a mutation.');
assert.equal(visibleActionBar(root), null, 'Action bar must disappear after cancel.');

controller.beginPlacement({ roleId: 'role-a', initialX: 1, initialY: 2 });
window.dispatchEvent(new FakeEvent('keydown', { key: 'Enter' }));
assert.equal(mutations, 2, 'Keyboard Enter must remain wired to coordinator confirm.');
assert.equal(visibleActionBar(root), null);

controller.beginFacing({ roleId: 'role-a', x: 1, y: 2, facingDegrees: 45 });
window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
assert.equal(mutations, 2, 'Keyboard Escape must remain a non-mutating cancel.');
assert.equal(visibleActionBar(root), null);

controller.beginPlacement({ roleId: 'role-a', initialX: 1, initialY: 2 });
assert.ok(visibleActionBar(root));
controller.destroy();
controller.destroy();
assert.equal(visibleActionBar(root), null, 'Destroy must remove action-bar DOM idempotently.');
assert.equal(mapTools.getMode(), 'program_authoring');
assert.equal((window.listeners.get('keydown') ?? []).length, 1, 'The controller must not add a second keyboard transaction owner.');
mapTools.destroy();
assert.equal((window.listeners.get('keydown') ?? []).length, 0, 'Coordinator keyboard listener must teardown normally.');

console.log('Combat Lab participant map action bar behavior smoke passed.');

function visibleActionBar(rootElement) {
  return walkElements(rootElement).find((element) => element.classList?.contains('combat-lab-participant-map-action-bar') && !element.hidden) ?? null;
}
