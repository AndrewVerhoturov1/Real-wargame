import assert from 'node:assert/strict';
import type { TacticalMapData } from '../src/core/map/MapModel';
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
assert.equal(staging.maxPreparationsPerStep, 1, 'one simulation step must prepare at most one cold perception geometry');
assert.ok(staging.deferredCount > 0, 'simultaneous cold observers must be deferred instead of blocking one tick');
assert.ok(
  staging.preparationCount >= stagedObservers.length,
  'all deferred observer geometries must become eligible on later attention cadences',
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
const mixedTankZone: PressureZoneData = {
  ...zones[0]!,
  id: 'mixed-tank-zone',
  label: 'Mixed tank zone',
  labelRu: 'Смешанная танковая цель',
  x: 100.5,
  y: 86.5,
  sourceTargetType: 'tank',
  sourceVisible: true,
};
const mixedState = createInitialState(map, [mixedObserver, mixedHostile], [mixedTankZone]);
for (let tick = 0; tick < 40; tick += 1) {
  mixedState.simulationStep += 1;
  mixedState.simulationTimeSeconds += 0.1;
  mixedState.units[0]!.position.x += 0.08;
  tickAllUnitPerception(mixedState, 0.1);
}
const mixedKnowledge = mixedState.units[0]!.perceptionKnowledge.contacts;
assert.ok(
  mixedKnowledge.some((contact) => contact.stimulusId === 'threat:mixed-tank-zone'),
  'a moving observer must eventually rebuild the deferred tank-height visibility field',
);
assert.ok(
  mixedKnowledge.some((contact) => contact.stimulusId === 'unit:mixed-hostile'),
  'a moving observer must not starve the deferred soldier-height hostile field behind another target height',
);

console.log(`Perception performance smoke passed: ${diagnostics.losCalculationCount} LOS calculations for ${diagnostics.candidateCount} candidates across 600 ticks; ${staging.preparationCount} cold geometries staged fairly with max ${staging.maxPreparationsPerStep} per step; mixed target heights remained observable.`);
