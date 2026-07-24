import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraph } from '../src/core/ai/AiGraphRunner';
import { withAiSimulationExecutionContext } from '../src/core/ai/AiSimulationExecutionContext';
import {
  contactInvestigationStateKey,
  createEmptyContactInvestigationState,
  deserializeContactInvestigationState,
  resolveContactInvestigation,
  serializeContactInvestigationState,
  type AiInvestigationContactSnapshot,
  type ContactInvestigationState,
} from '../src/core/ai/ContactInvestigation';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { advanceVisualContact } from '../src/core/perception/PerceptionContact';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';

verifyFirstSelection();
verifyMinimumHoldAndDeterministicTie();
verifyUrgentCloserSwitch();
verifyFreshFireSwitch();
verifyCompletionHandsOffToNextContact();
verifyTimeoutAppliesRevisitDelay();
verifyStaleAndIdentifiedContactsAreExcluded();
verifyStateSerialization();
verifyGraphRuntimeSelectionAndFallback();

console.log('Contact investigation selector smoke passed: stable hold, deterministic priority, urgent switching, Graph runtime handoff, completion, timeout, cooldown and automatic-attention fallback.');

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

function verifyGraphRuntimeSelectionAndFallback(): void {
  const map: TacticalMapData = {
    width: 40,
    height: 30,
    cellSize: 8,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  };
  const observerData: UnitData = {
    id: 'investigation-observer',
    label: 'Observer',
    labelRu: 'Наблюдатель',
    type: 'scout_team',
    side: 'blue',
    aiControl: 'graph',
    x: 5,
    y: 5,
  };
  const state = createInitialState(map, [observerData]);
  const unit = state.units[0]!;
  state.simulationTimeSeconds = 10;
  unit.perceptionKnowledge.contacts = [
    advanceVisualContact(null, {
      id: 'contact-a',
      stimulusId: 'unknown:a',
      labelRu: 'Контакт A',
      position: { x: 12, y: 5 },
      evidencePerSecond: 60,
      deltaSeconds: 1,
      nowSeconds: 10,
      source: 'visual',
    }),
    advanceVisualContact(null, {
      id: 'contact-b',
      stimulusId: 'unknown:b',
      labelRu: 'Контакт B',
      position: { x: 5, y: 18 },
      evidencePerSecond: 55,
      deltaSeconds: 1,
      nowSeconds: 10,
      source: 'visual',
    }),
  ];

  const graph: AiGraph = {
    version: 1,
    id: 'contact-investigation-runtime-smoke',
    name: 'Contact investigation runtime smoke',
    rootNodeId: 'root',
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', children: ['selector'] },
      { id: 'selector', type: 'Selector', children: ['investigate', 'automatic'] },
      {
        id: 'investigate',
        type: 'InvestigateContact',
        children: [],
        parameters: {
          minimumStage: 'cue',
          minimumConfidence: 15,
          completionStage: 'identified',
          searchArcDegrees: 120,
          maximumContactAgeSeconds: 10,
          minimumHoldSeconds: 1.2,
          preferredInvestigationSeconds: 3,
          maximumInvestigationSeconds: 5,
          revisitDelaySeconds: 4,
          switchAdvantagePercent: 25,
          urgentCloserMeters: 12,
          urgentCloserRatio: 0.6,
          reactToFreshFire: true,
        },
      },
      { id: 'automatic', type: 'ClearAttentionOverride', children: [] },
    ],
  };

  const first = withAiSimulationExecutionContext(state, unit, () => runAiGraph({
    graph,
    unitId: unit.id,
    blackboard: { self_position: { ...unit.position } },
    nowMs: 10_000,
  }));
  assert.equal(first.blackboard.investigation_contact_id, 'contact-a');
  assert.equal(first.blackboard.investigation_contact_available, true);
  const firstSector = first.effects.find((effect) => effect.type === 'set_search_sector');
  assert.ok(firstSector && firstSector.type === 'set_search_sector');
  assert.equal(firstSector.centerDegrees, 0);
  assert.equal(firstSector.arcDegrees, 120);
  assert.equal(typeof first.blackboard[contactInvestigationStateKey('investigate')], 'string');

  state.simulationTimeSeconds = 11.3;
  unit.perceptionKnowledge.contacts = unit.perceptionKnowledge.contacts.map((item) => item.id === 'contact-a'
    ? {
        ...item,
        stage: 'identified',
        evidence: 130,
        confidence: 90,
        visibleNow: true,
        observedNow: true,
        lastObservedSeconds: 11.3,
        lastUpdatedSeconds: 11.3,
      }
    : item);
  const second = withAiSimulationExecutionContext(state, unit, () => runAiGraph({
    graph,
    unitId: unit.id,
    blackboard: first.blackboard,
    nowMs: 11_300,
  }));
  assert.equal(second.blackboard.investigation_contact_id, 'contact-b', 'identified contact must hand off to next unknown contact');
  assert.equal(second.blackboard.investigation_contact_changed, true);
  assert.ok(second.trace.some((item) => item.nodeId === 'investigate' && item.reasonRu?.includes('Предыдущий контакт доразведан')));

  state.simulationTimeSeconds = 12;
  unit.perceptionKnowledge.contacts = unit.perceptionKnowledge.contacts.map((item) => ({
    ...item,
    stage: 'identified',
    evidence: 130,
    confidence: 90,
    visibleNow: true,
    observedNow: true,
    lastObservedSeconds: 12,
    lastUpdatedSeconds: 12,
  }));
  const third = withAiSimulationExecutionContext(state, unit, () => runAiGraph({
    graph,
    unitId: unit.id,
    blackboard: second.blackboard,
    nowMs: 12_000,
  }));
  assert.equal(third.blackboard.investigation_contact_available, false);
  assert.equal(third.blackboard.investigation_contact_id, null);
  assert.ok(third.effects.some((effect) => effect.type === 'clear_attention_override'), 'Selector must use automatic attention when no contact is eligible');
  assert.ok(!third.effects.some((effect) => effect.type === 'set_search_sector'));
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
