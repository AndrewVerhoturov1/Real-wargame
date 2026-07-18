import assert from 'node:assert/strict';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { setAttentionMode } from '../src/core/perception/AttentionController';
import { createEmptyPerceptionKnowledge } from '../src/core/perception/PerceptionContact';
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
verifyCheckIntervalDoesNotBecomeSampleDuration();
verifyCurrentVisibilityIsDenyByDefault();

console.log('Rear attention perception smoke passed: near 360 awareness, hard LOS, bounded rear range, bounded samples and deny-by-default current visibility.');

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
