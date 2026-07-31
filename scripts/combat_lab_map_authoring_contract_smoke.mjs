import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [controller, manager, menu, overlay] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabMapAuthoringController.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabMarkerManager.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabMapContextMenu.ts', 'utf8'),
  readFile('src/combat-lab/rendering/CombatLabScenarioAuthoringOverlayRenderer.ts', 'utf8'),
]);

assert.match(controller, /getMode: \(\) => CombatLabProgramMapModeV1/);
assert.match(controller, /if \(this\.options\.getMode\(\) !== 'program_authoring'\) \{/);
assert.match(controller, /readonly mapTools: CombatLabMapToolCoordinator/);
assert.match(controller, /readonly selection: CombatLabSelectionControllerV1/);
assert.match(controller, /readonly markerHost: HTMLElement/);
assert.match(controller, /readonly onMarkerPreviewChanged:/);
assert.match(controller, /options\.onMarkerPreviewChanged\(marker\)/);
assert.doesNotMatch(controller, /getCombatLabWorkspaceServices/);
assert.doesNotMatch(controller, /document\.querySelector<HTMLElement>\('\.combat-lab-workspace'\)/);
assert.doesNotMatch(controller, /combat-lab:marker-preview/);
assert.match(controller, /isParticipantTemporaryMode/);
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
assert.match(manager, /registerContributor/);
assert.match(manager, /move_marker/);
assert.match(manager, /resize_circle_marker/);
assert.doesNotMatch(controller, /face_point|turn_to_point/);
assert.doesNotMatch(controller, /deploy_anchor/, 'Ground deploy anchor must not be shown because the accepted action contract has no marker reference.');

assert.match(menu, /keepInsideViewport/);
assert.match(menu, /window\.innerWidth/);
assert.match(menu, /window\.innerHeight/);
assert.match(menu, /this\.root\.replaceChildren/);

assert.match(overlay, /constructor\(parent: Container\)/);
assert.match(overlay, /for \(const marker of experiment\.markers\)/);
assert.match(overlay, /setMarkerSelection/);
assert.match(overlay, /setMarkerPreview/);
assert.match(overlay, /drawCircleEditHandles/);
assert.match(overlay, /MAX_RELATION_LABELS = 64/);
assert.match(overlay, /destroy\(\): void/);
assert.doesNotMatch(overlay, /new Application|HTMLCanvasElement|requestAnimationFrame|ticker|objective/i);

console.log('Combat Lab map authoring contract smoke passed.');
