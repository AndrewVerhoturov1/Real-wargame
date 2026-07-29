import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [controller, menu, overlay] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabMapAuthoringController.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabMapContextMenu.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabScenarioAuthoringOverlayRenderer.ts', 'utf8'),
]);

assert.match(controller, /getMode: \(\) => 'scenario_editor' \| 'manual_control'/);
assert.match(controller, /if \(this\.options\.getMode\(\) !== 'scenario_editor'\) \{/);
assert.match(controller, /addEventListener\('pointerdown'.*true\)/);
assert.match(controller, /stopImmediatePropagation\(\)/);
assert.match(controller, /camera\.screenToWorld/);
assert.match(controller, /worldToGrid/);
assert.match(controller, /requestPick\(request: CombatLabMapPickRequestV1\)/);
assert.match(controller, /Escape/);
assert.match(controller, /single/);
assert.match(controller, /short_burst/);
assert.match(controller, /long_burst/);
assert.match(controller, /suppress/);
assert.match(controller, /first_aid/);
assert.match(controller, /transfer/);
assert.match(controller, /point/);
assert.match(controller, /circle/);
assert.doesNotMatch(controller, /face_point|turn_to_point/);
assert.doesNotMatch(controller, /deploy_anchor/, 'Ground deploy anchor must not be shown because the accepted action contract has no marker reference.');

assert.match(menu, /keepInsideViewport/);
assert.match(menu, /window\.innerWidth/);
assert.match(menu, /window\.innerHeight/);
assert.match(menu, /this\.root\.replaceChildren/);

assert.match(overlay, /getWorldContainer|constructor\(parent: Container\)/);
assert.match(overlay, /for \(const marker of experiment\.markers\)/);
assert.match(overlay, /MAX_RELATION_LABELS = 64/);
assert.match(overlay, /destroy\(\): void/);
assert.doesNotMatch(overlay, /new Application|HTMLCanvasElement|requestAnimationFrame|ticker|objective/i);

console.log('Combat Lab map authoring contract smoke passed.');
