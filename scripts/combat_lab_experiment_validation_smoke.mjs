import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await Promise.all([
  'src/core/testing/combat-lab/experiment/CombatLabExperimentValidation.ts',
  'src/core/testing/combat-lab/experiment/CombatLabExperimentValidationRules.ts',
  'src/core/testing/combat-lab/experiment/CombatLabExperimentValidationSupport.ts',
].map((path) => readFile(path, 'utf8')))).join('\n');
assert.match(source, /interface CombatLabExperimentIssueV1/);
assert.match(source, /severity: 'error' \| 'warning' \| 'info'/);
for (const marker of [
  'combat_lab_experiment_schema_unsupported',
  'combat_lab_role_id_duplicate',
  'combat_lab_marker_out_of_bounds',
  'combat_lab_marker_radius_invalid',
  'combat_lab_step_dependency_cycle',
  'combat_lab_repeat_attempts_invalid',
  'combat_lab_batch_run_count_invalid',
  'combat_lab_track_limit_exceeded',
  'combat_lab_fire_weapon_missing',
  'combat_lab_fire_mode_unsupported',
  'combat_lab_helper_matches_actor',
  'combat_lab_condition_already_true',
  'combat_lab_step_disabled',
  'combat_lab_repeat_ammo_insufficient',
]) assert.match(source, new RegExp(marker), `Missing validation issue ${marker}`);
assert.match(source, /validateCombatLabExperiment\(/);
assert.doesNotMatch(source, /throw new Error/, 'Typed validation must report issues instead of throwing.');
assert.doesNotMatch(source, /\b(document|window|PIXI|pixi\.js)\b/);
console.log('Combat Lab experiment validation smoke passed.');
