import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [executor, conditions, completion] = await Promise.all([
  readFile('src/core/testing/combat-lab/experiment/CombatLabScenarioExecutor.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabScenarioConditions.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabScenarioCompletion.ts', 'utf8'),
]);
assert.match(executor, /export class CombatLabScenarioExecutor/);
for (const method of ['static create', 'beforeSimulationStep', 'afterSimulationStep', 'getSnapshot', 'stop']) assert.match(executor, new RegExp(method.replace(' ', '\\s+')));
assert.match(executor, /for \(const track of this\.tracks\)/);
assert.match(executor, /firstUnfinishedStep\(track\)/);
assert.match(executor, /executeCombatLabCommand\(/);
assert.match(executor, /maximumAttempts/);
assert.match(executor, /stop_experiment|skip_step|failurePolicy === 'wait'/);
assert.match(executor, /paused_at_breakpoint/);
assert.match(executor, /Object\.freeze/);
for (const kind of ['fire', 'cancel_fire', 'move', 'posture', 'reload', 'deploy', 'undeploy', 'transfer', 'first_aid']) assert.match(executor, new RegExp(`'${kind}'`));
assert.match(conditions, /step_state/);
assert.match(conditions, /perceptionKnowledge\.contacts/);
assert.match(conditions, /getEffectiveCombatCapabilities/);
assert.match(completion, /unit\.order/);
assert.match(completion, /physicalAction/);
assert.match(completion, /lastFireResult/);
assert.match(completion, /committedShots/);
assert.match(completion, /impacts/);
assert.match(completion, /terminations/);
assert.match(completion, /lastActionResult/);
assert.match(completion, /lastFirstAidResult/);
const clean = `${executor}\n${conditions}\n${completion}`;
assert.doesNotMatch(clean, /tickSimulation\s*\(/, 'Executor must not advance production simulation.');
assert.doesNotMatch(clean, /activeProjectiles\.(push|splice)|wounds\.(push|splice)|suppressionLevel\s*=/, 'Executor must not create gameplay facts directly.');
assert.doesNotMatch(clean, /\b(document|window|PIXI|pixi\.js|setInterval|setTimeout|requestAnimationFrame)\b/);
console.log('Combat Lab scenario executor smoke passed.');
