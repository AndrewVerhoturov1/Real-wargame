import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, tracks, card, css] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabTrackList.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabStepCard.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/combat-lab-scenario-editor.css', 'utf8'),
]);

assert.match(panel, /CombatLabTrackDialog/);
assert.match(panel, /CombatLabStepDialog/);
assert.match(panel, /setActive\(active: boolean\)/);
assert.match(panel, /program_authoring/);
assert.doesNotMatch(panel, /sharedMapInputOwnership|scenario_editor' \| 'manual_control/);
assert.match(tracks, /scrollTrackIntoView/);
for (const row of ['combat-lab-step-name-row', 'combat-lab-step-relation-row', 'combat-lab-step-condition-row', 'combat-lab-step-runtime-row']) {
  assert.match(card, new RegExp(row));
}
assert.doesNotMatch(card, /stepId|trackId.*textContent/, 'Technical IDs must not be primary card copy.');
assert.match(css, /--combat-lab-program-width:\s*360px/);
assert.match(css, /min-width:\s*340px/);
assert.match(css, /max-width:\s*380px/);
assert.match(css, /overflow-wrap:\s*anywhere/);
assert.match(css, /text-overflow:\s*ellipsis/);

console.log('Combat Lab program layout behavior smoke passed.');
