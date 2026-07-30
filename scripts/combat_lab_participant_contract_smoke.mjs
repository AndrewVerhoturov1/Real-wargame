import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contracts = readFileSync('src/core/testing/combat-lab/experiment/CombatLabExperimentContracts.ts', 'utf8');
const serialization = readFileSync('src/core/testing/combat-lab/experiment/CombatLabExperimentSerialization.ts', 'utf8');
const validation = readFileSync('src/core/testing/combat-lab/experiment/CombatLabExperimentValidation.ts', 'utf8');
const digest = readFileSync('src/core/testing/combat-lab/experiment/CombatLabExperimentDigest.ts', 'utf8');
const builtIns = readFileSync('src/core/testing/combat-lab/experiment/CombatLabBuiltInExperiments.ts', 'utf8');

assert.match(contracts, /interface CombatLabParticipantParametersV1/);
assert.match(contracts, /readonly accuracy: CombatLabAccuracyOverridesV1 \| null/);
assert.match(contracts, /readonly parameters: CombatLabParticipantParametersV1/);
assert.doesNotMatch(contracts, /readonly parameters\?: CombatLabParticipantParametersV1/);
assert.match(serialization, /migrateCombatLabExperimentV1/);
assert.match(serialization, /LEGACY_ONLY_KEYS = new Set\(\['selectableAs'\]\)/);
assert.match(validation, /combat_lab_participant_unit_duplicate/);
assert.match(digest, /parameters: role\.parameters/);
assert.match(builtIns, /parameters:\s*\{ schemaVersion:\s*1, accuracy:\s*null \}/);
console.log('combat_lab_participant_contract_smoke: PASS');
