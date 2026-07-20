import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { advanceVisualContact, upsertPerceptionContact } from '../src/core/perception/PerceptionContact';
import {
  getPerceptionDiagnostics,
  tickAllUnitPerception,
  tickSelectedSoldierPerception,
} from '../src/core/perception/PerceptionSystem';
import type { PressureZoneData } from '../src/core/pressure/PressureZone';
import { createInitialState, selectUnit } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';
import { getPerceptionGeometryPreparationDiagnostics } from '../src/core/visibility/PointVisibility';

const map: TacticalMapData = {
  width: 220,
  height: 220,
  cellSize: 8,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
};

const observer: UnitData = {
  id: 'performance-observer',
  label: 'Performance observer',
  labelRu: 'Проверочный наблюдатель',
  type: 'scout_team',
  side: 'player',
  x: 109.5,
  y: 109.5,
  facingDegrees: 0,
  viewRangeCells: 90,
  behaviorProfile: 'regular',
  attention: { defaultMode: 'march' },
};

const zones: PressureZoneData[] = Array.from({ length: 120 }, (_, index) => {
  const angle = index / 120 * Math.PI * 2;
  const radius = 20 + (index % 8) * 4;
  return {
    id: `performance-source-${index}`,
    label: `Source ${index}`,
    labelRu: `Источник ${index}`,
    type: 'debug',
    shape: 'circle',
    mode: 'directional_fire',
    x: 110 + Math.cos(angle) * radius,
    y: 110 + Math.sin(angle) * radius,
    radiusCells: 1,
    widthCells: 1,
    heightCells: 1,
    strength: 0,
    suppression: 0,
    stressPerSecond: 0,
    directionDegrees: 0,
    arcDegrees: 60,
    rangeCells: 100,
    enabled: true,
    sourceVisible: true,
    sourceKnown: false,
    knowledgeConfidence: 0,
    uncertaintyCells: 5,
    reason: 'Performance stimulus.',
    reasonRu: 'Источник для проверки производительности.',
  };
});

const reuseObservers: UnitData[] = Array.from({ length: 6 }, (_, index) => ({
  ...observer,
  id: `reuse-observer-${index}`,
  label: `Reuse observer ${index}`,
  labelRu: `Наблюдатель повторного входа ${index}`,
  side: index % 2 === 0 ? 'blue' : 'red',
  x: 80.5 + index * 4,
  y: 90.5,
}));
const reuseState = createInitialState(map, reuseObservers, []);
reuseState.simulationStep = 1;
reuseState.simulationTimeSeconds = 0.1;
const reuseDiagnostic = tickAllUnitPerception(reuseState, 0.1);
assert.deepEqual(reuseDiagnostic, {
  stimuliBuildCount: 1,
  observerEvaluationCount: 6,
  sharedStimulusCount: 6,
}, 'six observers in one simulation step must share one objective stimulus preparation and retain six observer-specific evaluations');

const leakState = createInitialState(map, [
  { ...observer, id: 'known-observer', side: 'blue', x: 40.5, y: 40.5 },
  { ...observer, id: 'unknown-observer', side: 'blue', x: 44.5, y: 40.5 },
  { ...observer, id: 'hidden-hostile', side: 'red', x: 180.5, y: 180.5 },
], []);
const knownObserver = leakState.units.find((unit) => unit.id === 'known-observer')!;
const unknownObserver = leakState.units.find((unit) => unit.id === 'unknown-observer')!;
const hiddenHostile = leakState.units.find((unit) => unit.id === 'hidden-hostile')!;
upsertPerceptionContact(knownObserver.perceptionKnowledge, advanceVisualContact(null, {
  id: 'perception:unit:hidden-hostile',
  stimulusId: 'unit:hidden-hostile',
  sourceUnitId: hiddenHostile.id,
  labelRu: hiddenHostile.labels.ru,
  position: hiddenHostile.position,
  evidencePerSecond: 220,
  deltaSeconds: 1,
  nowSeconds: 0,
  source: 'visual',
}));
unknownObserver.attentionRuntime.nextFocusCheckSeconds = 999;
unknownObserver.attentionRuntime.nextDirectCheckSeconds = 999;
unknownObserver.attentionRuntime.nextPeripheralCheckSeconds = 999;
unknownObserver.attentionRuntime.nextRearCheckSeconds = 999;
leakState.simulationStep = 1;
leakState.simulationTimeSeconds = 0.1;
const leakDiagnostic = tickAllUnitPerception(leakState, 0.1);
assert.ok(knownObserver.perceptionKnowledge.contacts.some((contact) => contact.sourceUnitId === hiddenHostile.id));
assert.equal(
  unknownObserver.perceptionKnowledge.contacts.some((contact) => contact.sourceUnitId === hiddenHostile.id),
  false,
  "shared objective stimuli must not copy one observer's subjective contact knowledge into another observer",
);

const evidenceDir = process.env.PERFORMANCE_EVIDENCE_DIR;
if (evidenceDir) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(`${evidenceDir}/perception-stimuli-reuse.json`, JSON.stringify({
    version: 1,
    observers: reuseDiagnostic.observerEvaluationCount,
    stimuliBuildCount: reuseDiagnostic.stimuliBuildCount,
    sharedStimulusCount: reuseDiagnostic.sharedStimulusCount,
    observerSpecificEvaluations: reuseDiagnostic.observerEvaluationCount,
    hiddenTargetKnownToFirstObserver: true,
    hiddenTargetKnownToSecondObserver: false,
    knowledgeLeak: false,
    leakScenarioStimuliBuildCount: leakDiagnostic.stimuliBuildCount,
  }, null, 2));
}

const state = createInitialState(map, [observer], zones);
selectUnit(state, observer.id);
const stepSeconds = 1 / 60;
for (let tick = 0; tick < 600; tick += 1) {
  state.simulationTimeSeconds += stepSeconds;
  tickSelectedSoldierPerception(state, stepSeconds);
}

const diagnostics = getPerceptionDiagnostics(state);
assert.equal(diagnostics.tickCount, 600);
assert.ok(diagnostics.candidateCount >= 600 * zones.length * 0.95, 'most stimuli should reach the broad phase');
assert.ok(diagnostics.losCalculationCount < diagnostics.candidateCount * 0.45, 'scheduled attention must avoid LOS on every candidate every tick');
assert.ok(diagnostics.skippedNotDueCount > 0, 'scheduler must skip candidates whose zone check is not due');
assert.ok(diagnostics.contactUpdateCount > 0, 'the selected soldier must still accumulate contacts');

const noSelection = createInitialState(map, [observer], zones);
for (let tick = 0; tick < 600; tick += 1) {
  noSelection.simulationTimeSeconds += stepSeconds;
  tickSelectedSoldierPerception(noSelection, stepSeconds);
}
const noSelectionDiagnostics = getPerceptionDiagnostics(noSelection);
assert.equal(noSelectionDiagnostics.losCalculationCount, 0);
assert.equal(noSelectionDiagnostics.candidateCount, 0);

const stagedObservers: UnitData[] = Array.from({ length: 5 }, (_, index) => ({
  ...observer,
  id: `staged-observer-${index}`,
  label: `Staged observer ${index}`,
  labelRu: `Поэтапный наблюдатель ${index}`,
  x: 95.5,
  y: 101.5 + index * 4,
}));
const stagedState = createInitialState(map, stagedObservers, [zones[0]!]);
for (let tick = 0; tick < 30; tick += 1) {
  stagedState.simulationStep += 1;
  stagedState.simulationTimeSeconds += 0.1;
  tickAllUnitPerception(stagedState, 0.1);
}
const staging = getPerceptionGeometryPreparationDiagnostics(stagedState);
assert.ok(
  staging.maxPreparationsPerStep > 0 && staging.maxPreparationsPerStep <= 2,
  'one simulation step must execute at most two logical target visibility probes',
);
assert.ok(staging.deferredCount > 0, 'simultaneous cold observers must be deferred instead of blocking one tick');
assert.ok(
  staging.preparationCount >= stagedObservers.length,
  'all deferred observer probes must become eligible on later attention cadences',
);
assert.ok(staging.cacheHitCount > 0, 'stable observer-target pairs must reuse cached target visibility results');
assert.ok(staging.pointTargetProbeCount > 0);
assert.equal(
  staging.pointPhysicalRayCount,
  staging.pointTargetProbeCount * 3,
  'every cold logical target probe must execute exactly three silhouette rays',
);
for (const unit of stagedState.units) {
  assert.ok(
    unit.perceptionKnowledge.contacts.length > 0,
    `${unit.id} must receive a fair perception turn without selection-dependent priority`,
  );
}

const mixedObserver: UnitData = {
  ...observer,
  id: 'mixed-observer',
  side: 'blue',
  x: 70.5,
  y: 80.5,
  attention: {
    defaultMode: 'observe',
    profiles: {
      observe: {
        focusAngleDegrees: 180,
        directAngleDegrees: 360,
        focusCheckIntervalSeconds: 0.05,
        directCheckIntervalSeconds: 0.05,
        peripheralCheckIntervalSeconds: 0.05,
      },
    },
    vision: { maximumVisualRangeMeters: 1_000 },
  },
};
const mixedHostile: UnitData = {
  ...observer,
  id: 'mixed-hostile',
  label: 'Mixed hostile',
  labelRu: 'Смешанная вражеская цель',
  side: 'red',
  x: 105.5,
  y: 80.5,
};
const mixedZones: PressureZoneData[] = Array.from({ length: 8 }, (_, index) => ({
  ...zones[index]!,
  id: `mixed-zone-${index}`,
  label: `Mixed zone ${index}`,
  labelRu: `Смешанная цель ${index}`,
  x: 94.5 + index,
  y: 86.5 + index % 2,
  sourceTargetType: index % 2 === 0 ? 'tank' : 'sniper',
  sourceVisible: true,
}));
const mixedState = createInitialState(map, [mixedObserver, mixedHostile], mixedZones);
const mixedObserverModel = mixedState.units[0]!;
const mixedHostileModel = mixedState.units[1]!;
const tracked = advanceVisualContact(null, {
  id: 'perception:unit:mixed-hostile',
  stimulusId: 'unit:mixed-hostile',
  sourceUnitId: 'mixed-hostile',
  labelRu: mixedHostileModel.labels.ru,
  position: { ...mixedHostileModel.position },
  evidencePerSecond: 220,
  deltaSeconds: 1,
  nowSeconds: 0,
  source: 'visual',
});
upsertPerceptionContact(mixedObserverModel.perceptionKnowledge, tracked);
const trackedStart = { ...tracked.lastKnownPosition };
for (let tick = 0; tick < 40; tick += 1) {
  mixedState.simulationStep += 1;
  mixedState.simulationTimeSeconds += 0.1;
  mixedObserverModel.position.x += 0.08;
  mixedHostileModel.position.x += 0.16;
  tickAllUnitPerception(mixedState, 0.1);
}
const trackedAfter = mixedObserverModel.perceptionKnowledge.contacts.find(
  (contact) => contact.stimulusId === 'unit:mixed-hostile',
);
assert.ok(trackedAfter, 'the tracked hostile contact must remain present');
assert.ok(
  Math.hypot(
    trackedAfter.lastKnownPosition.x - trackedStart.x,
    trackedAfter.lastKnownPosition.y - trackedStart.y,
  ) >= 2,
  'an existing hostile track must receive visibility budget ahead of ambient target-height fields',
);
assert.ok(
  mixedObserverModel.perceptionKnowledge.contacts.some((contact) => contact.stimulusId.startsWith('threat:mixed-zone-')),
  'ambient targets must still receive remaining perception opportunities',
);

console.log(`Perception performance smoke passed: ${diagnostics.losCalculationCount} LOS calculations for ${diagnostics.candidateCount} candidates across 600 ticks; ${staging.pointTargetProbeCount} logical target probes used ${staging.pointPhysicalRayCount} physical silhouette rays with max ${staging.maxPreparationsPerStep} logical probes per step; tracked hostile movement stayed current.`);
