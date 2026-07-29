import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [controller, menu, overlay] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabMapAuthoringController.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabMapContextMenu.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabScenarioAuthoringOverlayRenderer.ts', 'utf8'),
]);

const manualGuardCount = (controller.match(/getMode\(\) !== 'scenario_editor'/g) ?? []).length;
assert.ok(manualGuardCount >= 3, 'Every contextmenu/pointer path must leave manual control untouched.');
for (const eventName of ['contextmenu', 'pointerdown', 'pointerup', 'pointercancel']) {
  assert.match(controller, new RegExp(`addEventListener\\('${eventName}'`));
  assert.match(controller, new RegExp(`removeEventListener\\('${eventName}'`));
}
assert.match(controller, /window\.addEventListener\('keydown'/);
assert.match(controller, /window\.removeEventListener\('keydown'/);
assert.match(controller, /this\.menu\.destroy\(\)/);
assert.match(controller, /delete this\.canvas\.dataset\.combatLabMapPick/);
assert.match(menu, /removeEventListener\('pointerdown'/);
assert.match(menu, /window\.removeEventListener\('resize'/);
assert.match(menu, /window\.removeEventListener\('blur'/);
assert.match(overlay, /if \(this\.destroyed\) return/);
assert.match(overlay, /this\.container\.removeFromParent\(\)/);
assert.match(overlay, /this\.container\.destroy\(\{ children: true \}\)/);

assert.doesNotMatch(controller, /issueRoutedMoveOrderToSelectedUnits|requestPlayerPostureTransition|tickSimulation/,
  'Scenario editor must author data, not execute production commands immediately.');
assert.doesNotMatch(overlay, /SimulationState|state\.units|renderer.*truth/i,
  'Authoring overlay must render only serialized experiment data.');

console.log('Combat Lab map authoring regression smoke passed.');
