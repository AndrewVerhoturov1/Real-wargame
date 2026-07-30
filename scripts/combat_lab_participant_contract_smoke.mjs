import assert from 'node:assert/strict';
import {
  accuracy,
  loadTypescriptModule,
  makeExperiment,
  stableDigest,
} from './combat_lab_participant_test_support.mjs';

const support = {
  asRecord: (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null,
  text: (value) => typeof value === 'string' ? value : '',
  finite: (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback,
  error: (code, messageRu, path) => ({ severity: 'error', code, messageRu, path }),
  warning: (code, messageRu, path) => ({ severity: 'warning', code, messageRu, path }),
  collectUniqueIds: (items, key, path, code, label, issues) => {
    const ids = new Set();
    items.forEach((item, index) => {
      const value = item?.[key];
      if (typeof value !== 'string' || !value || ids.has(value)) issues.push({ severity: 'error', code, messageRu: label, path: `${path}[${index}].${key}` });
      else ids.add(value);
    });
    return ids;
  },
  missingReference: (issues, code, messageRu, path) => issues.push({ severity: 'error', code, messageRu, path }),
  readSceneUnits: (experiment) => experiment.sceneSnapshot.units,
  validateFiniteRange: () => {},
  conditionsOfStep: () => [],
  detectDependencyCycles: () => {},
};
const rules = {
  isConditionInitiallyTrue: () => false,
  validateActionWarnings: () => {},
  validateBatchConfig: () => {},
  validateConditionReferences: () => {},
  validateMarkers: () => {},
  validateRepeat: () => {},
  validateSeed: () => {},
  validateStep: () => {},
  validateStopCondition: () => {},
};
const stubs = {
  './CombatLabExperimentValidationSupport': support,
  './CombatLabExperimentValidationRules': rules,
  '../CombatLabDigest': { digestStableValue: stableDigest },
};

const serialization = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabExperimentSerialization.ts', stubs);
const validation = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabExperimentValidation.ts', stubs);
const digest = loadTypescriptModule('src/core/testing/combat-lab/experiment/CombatLabExperimentDigest.ts', stubs);

const legacy = makeExperiment();
legacy.roles = [{
  roleId: 'shooter',
  unitId: 'unit-shooter',
  titleRu: 'Стрелок',
  selectableAs: ['actor', 'target'],
}];
const before = structuredClone(legacy);
const parsed = serialization.parseCombatLabExperiment(JSON.stringify(legacy));
assert.ok(parsed.experiment, parsed.issues.map((issue) => issue.messageRu).join('; '));
assert.deepEqual(parsed.experiment.roles[0].parameters, { schemaVersion: 1, accuracy: null });
assert.deepEqual(legacy, before, 'Миграция не должна менять исходный объект.');

const serialized = serialization.serializeCombatLabExperiment(parsed.experiment);
assert.equal(JSON.parse(serialized).roles[0].selectableAs, undefined);
assert.deepEqual(JSON.parse(serialized).roles[0].parameters, { schemaVersion: 1, accuracy: null });

const missingParameters = structuredClone(parsed.experiment);
delete missingParameters.roles[0].parameters;
const missingIssues = validation.validateCombatLabExperiment(missingParameters);
assert.ok(missingIssues.some((issue) => issue.code === 'combat_lab_participant_parameters_missing'));

const withParameters = structuredClone(parsed.experiment);
withParameters.roles[0].parameters = { schemaVersion: 1, accuracy: accuracy(99, 1.4) };
assert.notEqual(digest.digestCombatLabExperiment(parsed.experiment), digest.digestCombatLabExperiment(withParameters));
assert.deepEqual(parsed.experiment.roles[0].parameters, { schemaVersion: 1, accuracy: null });

console.log('combat_lab_participant_contract_smoke: PASS');
