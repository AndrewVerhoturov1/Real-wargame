import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const parameters = readFileSync('src/core/testing/combat-lab/experiment/CombatLabParticipantParameters.ts', 'utf8');
const executor = readFileSync('src/core/testing/combat-lab/experiment/CombatLabParticipantScenarioExecutor.ts', 'utf8');
const runner = readFileSync('src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts', 'utf8');
const controls = readFileSync('src/combat-lab/ui/CombatLabAccuracyControls.ts', 'utf8');

const stepIndex = parameters.indexOf("source: 'step'");
const participantIndex = parameters.indexOf("source: 'participant'");
const experimentIndex = parameters.indexOf("source: 'experiment'");
assert.ok(stepIndex >= 0 && participantIndex > stepIndex && experimentIndex > participantIndex);
assert.match(parameters, /deriveCombatLabParticipantStepSeed\([\s\S]*roleId[\s\S]*stepId/);
assert.match(executor, /resolveParticipantStepParameters/);
assert.match(runner, /CombatLabParticipantScenarioExecutor/);
assert.doesNotMatch(runner, /trackIndex \* 1_024/);
assert.match(controls, /loadForUnit\(/);
console.log('combat_lab_participant_parameters_smoke: PASS');
