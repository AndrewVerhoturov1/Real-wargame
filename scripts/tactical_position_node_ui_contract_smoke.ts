import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS,
  TACTICAL_POSITION_NODE_PARAMETER_GROUPS,
  createDefaultTacticalPositionNodeParameters,
} from '../src/core/tactical/TacticalPositionNodeSettings';

const repoRoot = process.cwd();
const readSource = (relativePath: string): string => readFileSync(path.join(repoRoot, relativePath), 'utf8');
const uiSource = readSource('src/ai-node-editor/tactical-position-node-ui.ts');
const cssSource = readSource('src/ai-node-editor/tactical-position-node-ui.css');
const contractUiSource = readSource('src/ai-node-editor/node-contract-ui.ts');
const runnerSource = readSource('src/core/ai/AiGraphRunner.ts');
const hostSource = readSource('src/core/tactical/SimulationTacticalPositionGraphHost.ts');
const workerWrapperSource = readSource('src/core/tactical/ConfiguredGeneralizedTacticalPositionSearch.ts');
const staticIdentitySource = readSource('src/core/tactical/static/StaticTacticalPositionBasis.ts');

assert.deepEqual(TACTICAL_POSITION_NODE_PARAMETER_GROUPS.map((group) => group.id), [
  'main', 'ranking', 'movement', 'constraints', 'posture', 'performance',
]);
assert.equal(TACTICAL_POSITION_NODE_PARAMETER_GROUPS.find((group) => group.id === 'performance')?.collapsedByDefault, true);
assert.ok(TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS.length >= 50, 'editor must expose the practical search surface');
for (const required of [
  'tacticalQualityWeight', 'movementObjectiveWeight', 'dangerWeight', 'protectionWeight',
  'concealmentWeight', 'routeCostWeight', 'maxPositionDanger', 'desiredDistanceMeters',
  'preliminaryCandidates', 'exactCandidates', 'exactRayLimit', 'maxRouteExpansions',
]) {
  assert.ok(TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS.some((descriptor) => descriptor.id === required), `missing UI descriptor ${required}`);
}

const defaults = createDefaultTacticalPositionNodeParameters('defense');
assert.equal(defaults.tacticalQualityWeight, 0.58);
assert.equal(defaults.movementObjectiveWeight, 0.42);
assert.match(uiSource, /data-reset-tactical-param/);
assert.match(uiSource, /data-reset-tactical-group/);
assert.match(uiSource, /normalizeTacticalPositionNodeParameters/);
assert.match(uiSource, /<details class=/);
assert.match(cssSource, /\.tactical-setting-group/);
assert.match(contractUiSource, /CreateTacticalPositionCandidates/);
assert.match(contractUiSource, /renderTacticalPositionParameterFields/);
assert.match(contractUiSource, /readTacticalPositionParameterFields/);

assert.match(runnerSource, /tacticalPositionSearchSettingsDigest/);
assert.match(runnerSource, /tacticalConfigMemoryKey/);
assert.match(runnerSource, /storedIdentity === currentIdentity/);
assert.match(runnerSource, /node\.type !== 'CreateCoverCandidates'/);
assert.match(hostSource, /attachTacticalPositionSearchSettings/);
assert.match(workerWrapperSource, /readTacticalPositionSearchSettings/);
assert.doesNotMatch(staticIdentitySource, /TacticalPositionNodeSettings|nodeSearchSettings/, 'subjective node settings must not enter static basis identity');
console.log('tactical position node UI contract smoke passed');
