import assert from 'node:assert/strict';
import { syncSoldierThreatMemory } from '../src/core/knowledge/SoldierThreatMemory';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { setAttentionMode } from '../src/core/perception/AttentionController';
import {
  advanceVisualContact,
  createEmptyPerceptionKnowledge,
} from '../src/core/perception/PerceptionContact';
import {
  getPerceptionDiagnostics,
  tickSelectedSoldierPerception,
} from '../src/core/perception/PerceptionSystem';
import type { PressureZoneData } from '../src/core/pressure/PressureZone';
import { createInitialState, selectUnit } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';
import {
  getUnitVisibilityField,
  sampleSelectedUnitVisibilityField,
  sampleSelectedUnitVisibilityZone,
  VISIBILITY_ZONE_CODE,
} from '../src/core/visibility/SelectedUnitVisibilityField';
import { computeLineOfSight } from '../src/core/visibility/LineOfSight';

const openMap: TacticalMapData = {
  width: 150,
  height: 24,
  cellSize: 8,
  metersPerCell: 1,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
};

const observerData: UnitData = {
  id: 'rear-smoke-observer',
  label: 'Observer',
  labelRu: 'Наблюдатель',
  type: 'scout_team',
  side: 'blue',
  x: 80,
  y: 10,
  facingDegrees: 0,
  viewRangeCells: 140,
  behaviorProfile: 'regular',
  aiControl: 'manual',
};

verifyNearRearBypassesRearCadence();
verifyNearHardLosStillBlocks();
verifyRearRangeDeniesBeforeLos();
verifyRearCadenceKeepsCurrentContactStable();
verifyOutsideRearRangeDoesNotFreezeCurrentContact();
verifyCheckIntervalDoesNotBecomeSampleDuration();
verifyCurrentVisibilityIsDenyByDefault();

console.log('Rear attention perception smoke passed: near 360 awareness, hard LOS, bounded rear range and samples, stable scheduled rear contacts and tactical danger memory, stale-current-contact revocation and deny-by-default current visibility.');

function verifyNearRearBypassesRearCadence(): void {
  const target = threat('near-rear', 78.6, 10.5);
  const state = createInitialState(openMap, [observerData], [target]);
  selectUnit(state, observerData.id);
  const observer = state.units[0]!;
  setAttentionMode(observer, 'observe', 'player');
  observer.attentionRuntime.nextRearCheckSeconds = 100;
  state.simulationTimeSeconds = 0.1;
  tickSelectedSoldierPerception(state, 0.1);
  const contact = observer.perceptionKnowledge.contacts.find((item) => item.stimulusId === 'threat:near-rear');
  assert.ok(contact, 'a rear target inside 2 m must be sampled without waiting for rear cadence');
  assert.ok(contact.explanationRu.some((line) => line.includes('Ближний круговой обзор')));
}

function verifyNearHardLosStillBlocks(): void {
  const blockedMap: TacticalMapData = {
    ...openMap,
    objects: [{
      id: 'near-wall',
      kind: 'structure',
      x: 78.6,
      y: 10,
      widthCells: 1.2,
      heightCells: 1,
      losHeightMeters: 3,
      coverProtection: 100,
      coverReliability: 100,
      concealment: 100,
      penetrable: false,
      coverPosture: 'standing',
      label: 'Wall',
      labelRu: 'Стена',
    }],
  };
  const targetPosition = { x: 78.6, y: 10.5 };
  const state = createInitialState(blockedMap, [observerData], [threat('near-blocked', targetPosition.x, targetPosition.y)]);
  selectUnit(state, observerData.id);
  const observer = state.units[0]!;
  const los = computeLineOfSight(state.map, observer, targetPosition, 1.7);
  assert.equal(los.blocked, true, 'the near target fixture must actually be behind a hard LOS blocker');
  observer.attentionRuntime.nextRearCheckSeconds = 0;
  state.simulationTimeSeconds = 0.1;
  tickSelectedSoldierPerception(state, 0.1);
  assert.equal(
    observer.perceptionKnowledge.contacts.find((item) => item.stimulusId === 'threat:near-blocked'),
    undefined,
    'near awareness must never see through hard blockers',
  );

  observer.perceptionKnowledge.contacts = [confirmedVisualContact('threat:near-blocked', targetPosition)];
  state.simulationTimeSeconds = 0.2;
  tickSelectedSoldierPerception(state, 0.1);
  const stale = observer.perceptionKnowledge.contacts.find((item) => item.stimulusId === 'threat:near-blocked');
  assert.ok(stale, 'the previously confirmed contact should remain as memory');
  assert.equal(stale.visibleNow, false, 'hard LOS must revoke visibleNow immediately');
  assert.equal(stale.observedNow, false, 'hard LOS must revoke observedNow immediately');
}

function verifyRearRangeDeniesBeforeLos(): void {
  const state = createInitialState(openMap, [observerData], [threat('far-rear', 14.5, 10.5)]);
  selectUnit(state, observerData.id);
  const observer = state.units[0]!;
  setAttentionMode(observer, 'engage', 'player');
  observer.attentionRuntime.nextRearCheckSeconds = 0;
  state.simulationTimeSeconds = 1;
  tickSelectedSoldierPerception(state, 0.1);
  assert.equal(
    observer.perceptionKnowledge.contacts.find((item) => item.stimulusId === 'threat:far-rear'),
    undefined,
    'a rear target beyond engage rearMaximumRangeMeters must remain unseen',
  );
  assert.equal(getPerceptionDiagnostics(state).losCalculationCount, 0, 'rear range must reject the target before the expensive LOS probe');
}

function verifyRearCadenceKeepsCurrentContactStable(): void {
  const targetPosition = { x: 30.5, y: 10.5 };
  const state = createInitialState(openMap, [observerData], [threat('rear-stable', targetPosition.x, targetPosition.y)]);
  selectUnit(state, observerData.id);
  const observer = state.units[0]!;
  setAttentionMode(observer, 'observe', 'player');
  const rearCheckIntervalSeconds = observer.attentionSettings.profiles.observe.rearCheckIntervalSeconds;
  observer.perceptionKnowledge.contacts = [confirmedVisualContact('threat:rear-stable', targetPosition)];
  observer.attentionRuntime.nextRearCheckSeconds = 100;

  state.simulationTimeSeconds = 0.1;
  tickSelectedSoldierPerception(state, 0.1);
  syncSoldierThreatMemory(state, observer, 0.1);
  const firstContact = observer.perceptionKnowledge.contacts.find((item) => item.stimulusId === 'threat:rear-stable');
  const firstThreat = observer.tacticalKnowledge.threats.find((item) => item.id === 'rear-stable');
  assert.ok(firstContact, 'a confirmed rear contact should remain available between scheduled rear samples');
  assert.equal(firstContact.visibleNow, true, 'rear cadence must not blink visibleNow off between checks');
  assert.equal(firstContact.observedNow, true, 'rear cadence must not blink observedNow off between checks');
  assert.equal(firstContact.evidence, 200, 'a held scheduled contact must not decay between checks');
  assert.ok(firstThreat, 'the stable rear contact must feed tactical threat memory');
  assert.equal(firstThreat.visibleNow, true, 'tactical danger memory must not blink off between rear checks');

  state.simulationTimeSeconds = 0.2;
  tickSelectedSoldierPerception(state, 0.1);
  syncSoldierThreatMemory(state, observer, 0.1);
  const secondContact = observer.perceptionKnowledge.contacts.find((item) => item.stimulusId === 'threat:rear-stable');
  const secondThreat = observer.tacticalKnowledge.threats.find((item) => item.id === 'rear-stable');
  assert.ok(secondContact);
  assert.equal(secondContact.visibleNow, true, 'successive non-due ticks must keep the rear marker stable');
  assert.equal(secondThreat?.visibleNow, true, 'successive non-due ticks must keep the danger source stable');

  state.simulationTimeSeconds = rearCheckIntervalSeconds * 1.25 + 0.2;
  tickSelectedSoldierPerception(state, 0.1);
  syncSoldierThreatMemory(state, observer, 0.1);
  const expiredContact = observer.perceptionKnowledge.contacts.find((item) => item.stimulusId === 'threat:rear-stable');
  const expiredThreat = observer.tacticalKnowledge.threats.find((item) => item.id === 'rear-stable');
  assert.ok(expiredContact, 'an expired rear contact should remain as decaying memory');
  assert.equal(expiredContact.visibleNow, false, 'current rear visibility must expire when no scheduled sample refreshes it');
  assert.equal(expiredContact.observedNow, false, 'current rear observation must expire when no scheduled sample refreshes it');
  assert.equal(expiredThreat?.visibleNow, false, 'danger memory should transition to remembered rather than blink every tick');
}

function verifyOutsideRearRangeDoesNotFreezeCurrentContact(): void {
  const targetPosition = { x: 14.5, y: 10.5 };
  const state = createInitialState(openMap, [observerData], [threat('outside-rear-stale', targetPosition.x, targetPosition.y)]);
  selectUnit(state, observerData.id);
  const observer = state.units[0]!;
  setAttentionMode(observer, 'engage', 'player');
  observer.perceptionKnowledge.contacts = [confirmedVisualContact('threat:outside-rear-stale', targetPosition)];
  observer.attentionRuntime.nextRearCheckSeconds = 100;
  state.simulationTimeSeconds = 0.1;
  tickSelectedSoldierPerception(state, 0.1);
  const contact = observer.perceptionKnowledge.contacts.find((item) => item.stimulusId === 'threat:outside-rear-stale');
  assert.ok(contact, 'an out-of-range contact should remain as decaying memory');
  assert.equal(contact.visibleNow, false, 'outside rear range can never remain currently visible');
  assert.equal(contact.observedNow, false, 'outside rear range can never remain currently observed');
}

function verifyCheckIntervalDoesNotBecomeSampleDuration(): void {
  const baseline = runSingleRearSample(3.5);
  const longInterval = runSingleRearSample(30);
  assert.ok(baseline > 0, 'a due rear check inside range must accumulate some evidence');
  assert.equal(
    round(longInterval),
    round(baseline),
    'changing only rearCheckIntervalSeconds must not change evidence granted by one rear sample',
  );
}

function runSingleRearSample(rearCheckIntervalSeconds: number): number {
  const state = createInitialState(openMap, [observerData], [threat('sample-rear', 30.5, 10.5)]);
  selectUnit(state, observerData.id);
  const observer = state.units[0]!;
  setAttentionMode(observer, 'march', 'player');
  observer.attentionSettings.profiles.march.rearCheckIntervalSeconds = rearCheckIntervalSeconds;
  observer.attentionRuntime.nextRearCheckSeconds = 0;
  observer.perceptionKnowledge = createEmptyPerceptionKnowledge();
  state.simulationTimeSeconds = 1;
  tickSelectedSoldierPerception(state, 0.1);
  return observer.perceptionKnowledge.contacts.find((item) => item.stimulusId === 'threat:sample-rear')?.evidence ?? 0;
}

function verifyCurrentVisibilityIsDenyByDefault(): void {
  const state = createInitialState(openMap, [observerData]);
  const observer = state.units[0]!;
  setAttentionMode(observer, 'engage', 'player');
  const field = getUnitVisibilityField(state, observer);

  const farRearQuality = sampleSelectedUnitVisibilityField(field, 14, 10);
  const farRearZone = sampleSelectedUnitVisibilityZone(field, 14, 10);
  assert.equal(farRearQuality, 0, 'current visibility must remain zero outside rear range');
  assert.equal(farRearZone, VISIBILITY_ZONE_CODE.unseen, 'denied cells must retain the unseen zone code');

  const nearRearQuality = sampleSelectedUnitVisibilityField(field, 79, 10);
  const nearRearZone = sampleSelectedUnitVisibilityZone(field, 79, 10);
  assert.ok(nearRearQuality >= Math.round(0.9 * 255), 'near rear cell must receive the configured quality floor on open LOS');
  assert.equal(nearRearZone, VISIBILITY_ZONE_CODE.near);

  const rearInsideRangeQuality = sampleSelectedUnitVisibilityField(field, 30, 10);
  const rearInsideRangeZone = sampleSelectedUnitVisibilityZone(field, 30, 10);
  assert.ok(rearInsideRangeQuality > 0, 'rear cells inside the configured range must be explicitly resolved');
  assert.equal(rearInsideRangeZone, VISIBILITY_ZONE_CODE.rear);
}

function confirmedVisualContact(stimulusId: string, position: { x: number; y: number }) {
  return advanceVisualContact(null, {
    id: `perception:${stimulusId}`,
    stimulusId,
    sourceUnitId: null,
    labelRu: `Подтверждённый ${stimulusId}`,
    position,
    evidencePerSecond: 200,
    detectionVariance: 1,
    deltaSeconds: 1,
    nowSeconds: 0,
    source: 'visual',
    explanationRu: ['Начальный подтверждённый контакт для regression smoke.'],
  });
}

function threat(id: string, x: number, y: number): PressureZoneData {
  return {
    id,
    label: id,
    labelRu: `Источник ${id}`,
    type: 'debug',
    shape: 'circle',
    mode: 'directional_fire',
    x,
    y,
    radiusCells: 1,
    widthCells: 1,
    heightCells: 1,
    rotationDegrees: 0,
    strength: 0,
    suppression: 0,
    stressPerSecond: 0,
    directionDegrees: 180,
    arcDegrees: 60,
    rangeCells: 1,
    enabled: true,
    sourceVisible: true,
    sourceKnown: false,
    sourceTargetType: 'soldier',
    knowledgeConfidence: 0,
    uncertaintyCells: 1,
    reason: 'Rear attention smoke source.',
    reasonRu: 'Источник проверки заднего внимания.',
  };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
