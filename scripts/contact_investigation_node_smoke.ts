import assert from 'node:assert/strict';
import {
  contactInvestigationStateKey,
  createEmptyContactInvestigationState,
  deserializeContactInvestigationState,
  resolveContactInvestigation,
  serializeContactInvestigationState,
  type AiInvestigationContactSnapshot,
  type ContactInvestigationState,
} from '../src/core/ai/ContactInvestigation';

verifyFirstSelection();
verifyMinimumHoldAndDeterministicTie();
verifyUrgentCloserSwitch();
verifyFreshFireSwitch();
verifyCompletionHandsOffToNextContact();
verifyTimeoutAppliesRevisitDelay();
verifyStaleAndIdentifiedContactsAreExcluded();
verifyStateSerialization();

console.log('Contact investigation selector smoke passed: stable hold, deterministic priority, urgent switching, completion, timeout, cooldown and empty fallback.');

function verifyFirstSelection(): void {
  const result = resolveContactInvestigation({}, [
    contact('far', { confidence: 80, distanceMeters: 90 }),
    contact('near', { confidence: 55, distanceMeters: 20 }),
  ], null, 10);
  assert.equal(result.selection?.contact.id, 'near');
  assert.equal(result.selection?.changed, true);
  assert.equal(result.selection?.reason, 'selected_first');
  assert.equal(result.state.currentContactId, 'near');
}

function verifyMinimumHoldAndDeterministicTie(): void {
  const first = resolveContactInvestigation({}, [
    contact('alpha', { confidence: 60, distanceMeters: 35 }),
    contact('bravo', { confidence: 60, distanceMeters: 35 }),
  ], null, 10);
  assert.equal(first.selection?.contact.id, 'alpha', 'equal contacts must use deterministic contact id order');

  const second = resolveContactInvestigation({}, [
    contact('alpha', { confidence: 60, distanceMeters: 35 }),
    contact('bravo', { confidence: 72, distanceMeters: 34 }),
  ], first.state, 10.5);
  assert.equal(second.selection?.contact.id, 'alpha', 'ordinary score changes must not break minimum hold time');
  assert.equal(second.selection?.reason, 'held_minimum_time');
}

function verifyUrgentCloserSwitch(): void {
  const initial = stateFor('far', 10);
  const result = resolveContactInvestigation({}, [
    contact('far', { confidence: 78, distanceMeters: 45 }),
    contact('near', { confidence: 36, distanceMeters: 12 }),
  ], initial, 10.2);
  assert.equal(result.selection?.contact.id, 'near');
  assert.equal(result.selection?.reason, 'switched_urgent_closer');
}

function verifyFreshFireSwitch(): void {
  const initial = stateFor('visual', 10);
  const result = resolveContactInvestigation({}, [
    contact('visual', { confidence: 70, distanceMeters: 30, threatUrgency: 20 }),
    contact('incoming-fire', {
      confidence: 40,
      distanceMeters: 32,
      source: 'fire_pressure',
      recentFireEvidence: true,
      threatUrgency: 90,
    }),
  ], initial, 10.1);
  assert.equal(result.selection?.contact.id, 'incoming-fire');
  assert.equal(result.selection?.reason, 'switched_fresh_fire');
}

function verifyCompletionHandsOffToNextContact(): void {
  const initial = stateFor('identified', 10);
  const result = resolveContactInvestigation({}, [
    contact('identified', { stage: 'identified', confidence: 90, distanceMeters: 20 }),
    contact('next', { stage: 'suspicion', confidence: 42, distanceMeters: 35 }),
  ], initial, 12);
  assert.equal(result.selection?.contact.id, 'next');
  assert.equal(result.selection?.reason, 'current_completed');
  assert.ok(result.state.recentlyInvestigated.some((item) => item.id === 'identified'));
}

function verifyTimeoutAppliesRevisitDelay(): void {
  const initial = stateFor('only', 10);
  const timedOut = resolveContactInvestigation({}, [
    contact('only', { confidence: 75, distanceMeters: 25 }),
  ], initial, 15.1);
  assert.equal(timedOut.selection, null, 'timed out contact must not immediately select itself again');
  assert.equal(timedOut.state.currentContactId, null);
  assert.ok(timedOut.state.recentlyInvestigated.some((item) => item.id === 'only' && item.eligibleAfterSeconds > 15.1));

  const afterDelay = resolveContactInvestigation({}, [
    contact('only', { confidence: 75, distanceMeters: 25, lastUpdatedSeconds: 19.2 }),
  ], timedOut.state, 19.2);
  assert.equal(afterDelay.selection?.contact.id, 'only');
}

function verifyStaleAndIdentifiedContactsAreExcluded(): void {
  const result = resolveContactInvestigation({}, [
    contact('stale', { confidence: 80, distanceMeters: 20, lastUpdatedSeconds: 0 }),
    contact('identified', { stage: 'identified', confidence: 90, distanceMeters: 10 }),
  ], createEmptyContactInvestigationState(20), 20);
  assert.equal(result.selection, null);
  assert.equal(result.state.currentContactId, null);
}

function verifyStateSerialization(): void {
  const state: ContactInvestigationState = {
    currentContactId: 'alpha',
    selectedAtSeconds: 4,
    lastEvaluatedSeconds: 5,
    recentlyInvestigated: [{ id: 'old', eligibleAfterSeconds: 9 }],
  };
  assert.deepEqual(deserializeContactInvestigationState(serializeContactInvestigationState(state), 5), state);
  assert.equal(contactInvestigationStateKey('node-1'), '__real_wargame_investigate_contact_state__:node-1');
  assert.equal(deserializeContactInvestigationState('{broken', 7).currentContactId, null);
}

function stateFor(contactId: string, selectedAtSeconds: number): ContactInvestigationState {
  return {
    currentContactId: contactId,
    selectedAtSeconds,
    lastEvaluatedSeconds: selectedAtSeconds,
    recentlyInvestigated: [],
  };
}

function contact(
  id: string,
  overrides: Partial<AiInvestigationContactSnapshot> = {},
): AiInvestigationContactSnapshot {
  return {
    id,
    stage: 'suspicion',
    source: 'visual',
    confidence: 50,
    evidence: 55,
    uncertaintyCells: 2,
    lastKnownPosition: { x: 10, y: 10 },
    visibleNow: false,
    observedNow: false,
    lastObservedSeconds: 9,
    lastUpdatedSeconds: 10,
    distanceMeters: 30,
    recentFireEvidence: false,
    threatUrgency: 20,
    ...overrides,
  };
}
