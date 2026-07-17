import assert from 'node:assert/strict';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { getCell } from '../src/core/map/MapModel';
import { setAttentionMode, setSearchSector, updateAttentionController } from '../src/core/perception/AttentionController';
import {
  CONTACT_STAGE_THRESHOLDS,
  advanceVisualContact,
  contactStageRank,
  createEmptyPerceptionKnowledge,
  decayUnobservedContact,
  upsertPerceptionContact,
  type PerceptionContactMemory,
} from '../src/core/perception/PerceptionContact';
import { emitPerceptionSound } from '../src/core/perception/PerceptionSound';
import { buildPerceptionStimuli } from '../src/core/perception/PerceptionStimulus';
import type { PerceptionTargetType } from '../src/core/perception/PerceptionTargetProfile';
import {
  getBestPerceptionContact,
  getPerceptionDiagnostics,
  tickSelectedSoldierPerception,
} from '../src/core/perception/PerceptionSystem';
import type { PressureZoneData } from '../src/core/pressure/PressureZone';
import { createInitialState, selectUnit } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';
import { computeLineOfSight } from '../src/core/visibility/LineOfSight';

const baseMap: TacticalMapData = {
  width: 60,
  height: 40,
  cellSize: 16,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
};

const observerData: UnitData = {
  id: 'observer',
  label: 'Observer',
  labelRu: 'Наблюдатель',
  type: 'scout_team',
  side: 'player',
  x: 8,
  y: 18,
  facingDegrees: 0,
  viewRangeCells: 30,
  behaviorProfile: 'regular',
};

const frontZone = threat('front', 25, 18.5);
const sideZone = threat('side', 8.5, 31);
const state = createInitialState(baseMap, [observerData], [frontZone, sideZone]);
selectUnit(state, 'observer');
const observer = state.units[0];

assert.equal(observer.attentionSettings.defaultMode, 'observe');
assert.ok(observer.attentionSettings.profiles.march.peripheralWeight > observer.attentionSettings.profiles.engage.peripheralWeight);

setAttentionMode(observer, 'march', 'player');
runPerception(state, 2.5);
const frontMarch = observer.perceptionKnowledge.contacts.find((contact) => contact.stimulusId === 'threat:front');
const sideMarch = observer.perceptionKnowledge.contacts.find((contact) => contact.stimulusId === 'threat:side');
assert.ok(frontMarch, 'front source must create a contact on march');
assert.ok(sideMarch, 'side source must create a peripheral contact on march');
assert.ok(frontMarch.evidence > sideMarch.evidence, 'front evidence must exceed side evidence');
const marchSideEvidence = sideMarch.evidence;

observer.perceptionKnowledge = createEmptyPerceptionKnowledge();
observer.attentionRuntime.nextFocusCheckSeconds = 0;
observer.attentionRuntime.nextDirectCheckSeconds = 0;
observer.attentionRuntime.nextPeripheralCheckSeconds = 0;
setAttentionMode(observer, 'engage', 'player');
runPerception(state, 2.5);
const sideEngage = observer.perceptionKnowledge.contacts.find((contact) => contact.stimulusId === 'threat:side');
assert.ok(!sideEngage || sideEngage.evidence < marchSideEvidence * 0.55, 'engage peripheral evidence must be much weaker than march');

const rearState = createInitialState(
  baseMap,
  [{ ...observerData, x: 30, y: 18, facingDegrees: 0 }],
  [threat('rear', 10, 18.5)],
);
selectUnit(rearState, 'observer');
const rearObserver = rearState.units[0];
setAttentionMode(rearObserver, 'observe', 'player');
rearObserver.perceptionKnowledge = createEmptyPerceptionKnowledge();
rearObserver.attentionRuntime.nextFocusCheckSeconds = 0;
rearObserver.attentionRuntime.nextDirectCheckSeconds = 0;
rearObserver.attentionRuntime.nextPeripheralCheckSeconds = 0;
rearObserver.attentionRuntime.nextRearCheckSeconds = 10;
rearState.simulationTimeSeconds = 1;
tickSelectedSoldierPerception(rearState, 0.1);
assert.equal(
  rearObserver.perceptionKnowledge.contacts.find((contact) => contact.stimulusId === 'threat:rear'),
  undefined,
  'a target in the rear sector must not be visually checked before the existing rear interval is due',
);
assert.equal(
  getPerceptionDiagnostics(rearState).losCalculationCount,
  0,
  'rear cadence must reject the target before the expensive line-of-sight calculation',
);
rearObserver.attentionRuntime.nextRearCheckSeconds = 0;
rearState.simulationTimeSeconds = 10;
tickSelectedSoldierPerception(rearState, 0.1);
const rearContact = rearObserver.perceptionKnowledge.contacts.find((contact) => contact.stimulusId === 'threat:rear');
assert.ok(rearContact, 'a due rear check must use the normal visual contact pipeline');
assert.ok(
  rearContact.explanationRu.some((line) => line.includes('Качество зоны обзора')),
  'visual contact diagnostics must expose the existing coloured-zone visibility quality',
);

setSearchSector(observer, 0, Math.PI, 'player');
const startDirection = observer.attentionRuntime.focusDirectionRadians;
updateAttentionController(observer, 1);
assert.equal(observer.attentionRuntime.focusDirectionRadians, startDirection, 'search mode must use stable probabilistic coverage without physical sweep');

const evidenceContact = advanceVisualContact(null, {
  id: 'contact:test',
  stimulusId: 'test',
  labelRu: 'Проверочная цель',
  position: { x: 12, y: 12 },
  evidencePerSecond: 60,
  deltaSeconds: 2,
  nowSeconds: 2,
});
assert.equal(evidenceContact.stage, 'identified');
assert.ok(evidenceContact.evidence >= CONTACT_STAGE_THRESHOLDS.identified);
const decayed = decayUnobservedContact(evidenceContact, { deltaSeconds: 5, nowSeconds: 7, metersPerCell: 2 });
assert.ok(decayed);
assert.ok(decayed.confidence < evidenceContact.confidence);
assert.ok(decayed.uncertaintyCells > evidenceContact.uncertaintyCells);
const knowledge = createEmptyPerceptionKnowledge();
upsertPerceptionContact(knowledge, evidenceContact);
upsertPerceptionContact(knowledge, { ...evidenceContact, confidence: 90 });
assert.equal(knowledge.contacts.length, 1);
assert.ok(knowledge.revision >= 1);

const forestMap = createInitialState({ ...baseMap, width: 48, height: 12 }, [{ ...observerData, x: 2, y: 5 }]);
for (let x = 7; x <= 11; x += 1) {
  const cell = getCell(forestMap.map, x, 5);
  assert.ok(cell);
  cell.forest = 1;
}
const forestObserver = forestMap.units[0];
const partial = computeLineOfSight(forestMap.map, forestObserver, { x: 16.5, y: 5.5 });
assert.equal(partial.blocked, false);
assert.equal(partial.partialObscuration, true);
assert.ok(partial.visualTransmission > 0.04 && partial.visualTransmission < 1);

for (let x = 7; x <= 34; x += 1) {
  const cell = getCell(forestMap.map, x, 5);
  assert.ok(cell);
  cell.forest = 2;
}
const dense = computeLineOfSight(forestMap.map, forestObserver, { x: 39.5, y: 5.5 });
assert.equal(dense.blocked, true);
assert.ok(dense.visualTransmission <= 0.04);

const typedTargetState = createInitialState(baseMap, [observerData], [
  threat('sniper-target', 25, 18.5, 'sniper'),
  threat('tank-target', 28, 18.5, 'tank'),
]);
const typedStimuli = buildPerceptionStimuli(typedTargetState);
const sniperStimulus = typedStimuli.find((stimulus) => stimulus.id === 'threat:sniper-target');
const tankStimulus = typedStimuli.find((stimulus) => stimulus.id === 'threat:tank-target');
assert.ok(sniperStimulus && tankStimulus, 'typed threat sources must build perception stimuli');
assert.equal(sniperStimulus.targetType, 'sniper');
assert.equal(tankStimulus.targetType, 'tank');
assert.ok(tankStimulus.baseSize > sniperStimulus.baseSize * 2, 'tank visual size must greatly exceed sniper visual size');
assert.ok(tankStimulus.targetHeightMeters > sniperStimulus.targetHeightMeters, 'tank target height must exceed sniper target height');

const heightMap = createInitialState({
  ...baseMap,
  width: 24,
  height: 12,
  objects: [{
    id: 'low-cover',
    kind: 'cover',
    x: 10,
    y: 5,
    widthCells: 1,
    heightCells: 1,
    losHeightMeters: 1.2,
    label: 'Low cover',
    labelRu: 'Низкое укрытие',
  }],
}, [{ ...observerData, x: 2, y: 5 }]);
const heightObserver = heightMap.units[0];
const proneHeightLos = computeLineOfSight(heightMap.map, heightObserver, { x: 18.5, y: 5.5 }, 0.35);
const tankHeightLos = computeLineOfSight(heightMap.map, heightObserver, { x: 18.5, y: 5.5 }, 3.2);
assert.equal(proneHeightLos.blocked, true, 'low cover must hide a prone-height target');
assert.equal(tankHeightLos.blocked, false, 'the same low cover must not hide a tank-height target');

const soundState = createInitialState(baseMap, [observerData]);
selectUnit(soundState, 'observer');
emitPerceptionSound(soundState, {
  id: 'shot-behind',
  kind: 'rifle_shot',
  sourceId: 'enemy-shooter',
  labelRu: 'Выстрел с тыла',
  position: { x: 1, y: 18.5 },
  loudness: 1,
  createdSeconds: 0,
  durationSeconds: 2,
});
soundState.simulationTimeSeconds = 0.1;
tickSelectedSoldierPerception(soundState, 0.1);
const soundContact = getBestPerceptionContact(soundState.units[0]);
assert.ok(soundContact);
assert.equal(soundContact.source, 'sound');
assert.equal(soundContact.visibleNow, false);
assert.ok(soundContact.uncertaintyCells * soundState.map.metersPerCell >= 8);

const imported = createInitialState(baseMap, [{
  ...observerData,
  perceptionKnowledge: {
    contacts: [{
      id: 'saved-contact',
      stimulusId: 'saved-source',
      labelRu: 'Сохранённый контакт',
      stage: 'suspicion',
      source: 'reported',
      evidence: 55,
      confidence: 40,
      uncertaintyCells: 4,
      lastKnownPosition: { x: 14, y: 12 },
      visibleNow: false,
      observedNow: false,
      lastObservedSeconds: -1,
      lastUpdatedSeconds: 3,
      evidencePerSecond: 0,
      explanationRu: [],
    }],
    revision: 2,
    lastUpdatedSeconds: 3,
  },
}]);
assert.equal(imported.units[0].perceptionKnowledge.contacts.length, 1, 'scene import must preserve saved perception memory');

const bestContactState = createInitialState(baseMap, [observerData], []);
const bestContactUnit = bestContactState.units[0]!;
const contactBase = evidenceContact;
const differentialContactSets: PerceptionContactMemory[][] = [
  [],
  [
    { ...contactBase, id: 'tie-first', stimulusId: 'tie-first', confidence: 70, lastUpdatedSeconds: 4 },
    { ...contactBase, id: 'tie-second', stimulusId: 'tie-second', confidence: 70, lastUpdatedSeconds: 4 },
  ],
  [
    { ...contactBase, id: 'older-identified', stimulusId: 'older-identified', confidence: 80, lastUpdatedSeconds: 2 },
    { ...contactBase, id: 'newer-identified', stimulusId: 'newer-identified', confidence: 80, lastUpdatedSeconds: 6 },
    { ...contactBase, id: 'high-confidence-suspicion', stimulusId: 'high-confidence-suspicion', stage: 'suspicion', confidence: 100, lastUpdatedSeconds: 20 },
  ],
  [
    { ...contactBase, id: 'expired-but-ranked', stimulusId: 'expired-but-ranked', confidence: 0, lastUpdatedSeconds: -10, visibleNow: false, observedNow: false },
    { ...contactBase, id: 'fresh-suspicion', stimulusId: 'fresh-suspicion', stage: 'suspicion', confidence: 99, lastUpdatedSeconds: 30 },
  ],
];
for (const contacts of differentialContactSets) {
  bestContactUnit.perceptionKnowledge.contacts = [...contacts];
  const before = bestContactUnit.perceptionKnowledge.contacts.map((contact) => contact.id);
  const expected = referenceBestPerceptionContact(bestContactUnit.perceptionKnowledge.contacts);
  const actual = getBestPerceptionContact(bestContactUnit);
  assert.strictEqual(actual, expected, 'single-pass best-contact selection must match the stable clone/sort reference');
  assert.deepEqual(bestContactUnit.perceptionKnowledge.contacts.map((contact) => contact.id), before, 'best-contact selection must not mutate source order');
}
bestContactUnit.perceptionKnowledge.contacts = differentialContactSets[1]!;
assert.equal(getBestPerceptionContact(bestContactUnit)?.id, 'tie-first', 'exact ties must preserve the first input contact just like stable Array.sort');

const noSelection = createInitialState(baseMap, [observerData], [frontZone]);
noSelection.simulationTimeSeconds = 1;
tickSelectedSoldierPerception(noSelection, 0.1);
assert.equal(getPerceptionDiagnostics(noSelection).losCalculationCount, 0, 'no selected soldier must do no LOS work');

console.log('Perception system smoke passed: stable attention, rear cadence, shared visibility quality, target types, target height, transmission, contacts, sound and import behavior.');

function referenceBestPerceptionContact(contacts: readonly PerceptionContactMemory[]): PerceptionContactMemory | null {
  return [...contacts].sort((left, right) => (
    contactStageRank(right.stage) - contactStageRank(left.stage)
    || right.confidence - left.confidence
    || right.lastUpdatedSeconds - left.lastUpdatedSeconds
  ))[0] ?? null;
}

function runPerception(simulation: ReturnType<typeof createInitialState>, seconds: number): void {
  const step = 0.1;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    simulation.simulationTimeSeconds += step;
    tickSelectedSoldierPerception(simulation, step);
  }
}

function threat(
  id: string,
  x: number,
  y: number,
  sourceTargetType: PerceptionTargetType = 'soldier',
): PressureZoneData {
  return {
    id,
    label: id,
    labelRu: `Источник ${id}`,
    type: 'debug',
    shape: 'circle',
    mode: 'directional_fire',
    x,
    y,
    radiusCells: 2,
    widthCells: 2,
    heightCells: 2,
    rotationDegrees: 0,
    strength: 0,
    suppression: 0,
    stressPerSecond: 0,
    directionDegrees: 180,
    arcDegrees: 60,
    rangeCells: 30,
    enabled: true,
    sourceVisible: true,
    sourceKnown: false,
    sourceTargetType,
    knowledgeConfidence: 0,
    uncertaintyCells: 6,
    reason: 'Perception smoke source.',
    reasonRu: 'Источник для проверки восприятия.',
  };
}
