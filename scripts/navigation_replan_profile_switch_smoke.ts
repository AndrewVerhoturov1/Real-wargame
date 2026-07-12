import assert from 'node:assert/strict';
import { createDefaultNavigationProfileRegistry } from '../src/core/navigation/NavigationProfiles';
import { evaluateNavigationReplan } from '../src/core/navigation/NavigationReplanPolicy';

const registry = createDefaultNavigationProfileRegistry();
const normal = registry.getProfile('normal');
const stealth = registry.getProfile('stealth');

const switched = evaluateNavigationReplan({
  order: {
    navigationProfileId: normal.id,
    navigationProfileRevision: normal.revision,
    knowledgeRevision: 4,
    lastReplanAtSeconds: 0,
    pathCost: 40,
  },
  profile: stealth,
  nowSeconds: 10,
  blocked: false,
  currentProfileRevision: stealth.revision,
  currentKnowledgeRevision: 4,
  candidateCost: 44,
});
assert.equal(switched.reason, 'profile_changed');
assert.equal(switched.shouldSearch, true);
assert.equal(switched.shouldReplace, true, 'profile switches must apply even when costs from two profiles are not directly comparable');

const unchanged = evaluateNavigationReplan({
  order: {
    navigationProfileId: stealth.id,
    navigationProfileRevision: stealth.revision,
    knowledgeRevision: 4,
    lastReplanAtSeconds: 0,
    pathCost: 40,
  },
  profile: stealth,
  nowSeconds: 10,
  blocked: false,
  currentProfileRevision: stealth.revision,
  currentKnowledgeRevision: 4,
});
assert.equal(unchanged.shouldSearch, false);

console.log('Navigation profile switch smoke passed: profile id changes trigger controlled replanning even when revisions match.');
