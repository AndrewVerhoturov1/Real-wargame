import assert from 'node:assert/strict';
import { syncSoldierThreatMemory } from '../src/core/knowledge/SoldierThreatMemory';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { setAttentionMode } from '../src/core/perception/AttentionController';
import {
  advanceReportedContact,
  advanceVisualContact,
  type ReportedContactInput,
} from '../src/core/perception/PerceptionContact';
import { tickSelectedSoldierPerception } from '../src/core/perception/PerceptionSystem';
import { createInitialState, selectUnit } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';

verifyCurrentVisualContactOutranksSound();
verifyWeakRearCuePersistsBetweenScheduledChecks();

console.log('Perception contact priority smoke passed.');

function verifyCurrentVisualContactOutranksSound(): void {
  const visual = advanceVisualContact(null, {
    id: 'perception:unit:rear-sound-target',
    stimulusId: 'unit:rear-sound-target',
    sourceUnitId: 'rear-sound-target',
    labelRu: 'Цель в тылу',
    position: { x: 30.5, y: 10.5 },
    evidencePerSecond: 200,
    detectionVariance: 1,
    deltaSeconds: 1,
    nowSeconds: 1,
    source: 'visual',
    explanationRu: ['Успешная зрительная проверка.'],
  });

  const soundInput: ReportedContactInput = {
    id: visual.id,
    stimulusId: visual.stimulusId,
    sourceUnitId: visual.sourceUnitId,
    labelRu: visual.labelRu,
    position: { x: 31.5, y: 11.5 },
    confidence: 72,
    uncertaintyCells: 10,
    nowSeconds: 1.1,
    source: 'sound',
    explanationRu: ['Одновременный звук от той же цели.'],
  };

  const currentVisualAfterSound = advanceReportedContact(visual, soundInput);
  assert.equal(
    currentVisualAfterSound.source,
    'visual',
    'a sound cue must not downgrade a still-current visual contact',
  );
  assert.equal(currentVisualAfterSound.visibleNow, true);
  assert.equal(currentVisualAfterSound.observedNow, true);
  assert.deepEqual(currentVisualAfterSound.lastKnownPosition, visual.lastKnownPosition);
  assert.equal(currentVisualAfterSound.uncertaintyCells, visual.uncertaintyCells);

  const rememberedVisual = {
    ...visual,
    visibleNow: false,
    observedNow: false,
  };
  const rememberedVisualAfterSound = advanceReportedContact(rememberedVisual, soundInput);
  assert.equal(
    rememberedVisualAfterSound.source,
    'sound',
    'sound may refresh a visual contact after current observation has actually expired',
  );
  assert.equal(rememberedVisualAfterSound.visibleNow, false);
  assert.equal(rememberedVisualAfterSound.observedNow, false);
  assert.deepEqual(rememberedVisualAfterSound.lastKnownPosition, soundInput.position);
  assert.equal(rememberedVisualAfterSound.uncertaintyCells, soundInput.uncertaintyCells);
}

function verifyWeakRearCuePersistsBetweenScheduledChecks(): void {
  const map: TacticalMapData = {
    width: 150,
    height: 24,
    cellSize: 8,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  };
  const observer: UnitData = {
    id: 'weak-rear-observer',
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
  const target: UnitData = {
    id: 'weak-rear-target',
    label: 'Target',
    labelRu: 'Слабый контакт в тылу',
    type: 'infantry_squad',
    side: 'red',
    x: 30.5,
    y: 10.5,
    facingDegrees: 180,
    viewRangeCells: 140,
    behaviorProfile: 'regular',
    aiControl: 'manual',
  };
  const state = createInitialState(map, [observer, target]);
  selectUnit(state, observer.id);
  const unit = state.units.find((candidate) => candidate.id === observer.id)!;
  setAttentionMode(unit, 'engage', 'player');
  unit.attentionRuntime.nextRearCheckSeconds = 0;

  state.simulationTimeSeconds = 1;
  tickSelectedSoldierPerception(state, 0.1);
  syncSoldierThreatMemory(state, unit, 0.1);

  const sampled = unit.perceptionKnowledge.contacts.find((contact) => contact.stimulusId === `unit:${target.id}`);
  assert.ok(sampled, 'a due rear check must create a weak visual cue');
  assert.equal(sampled.source, 'visual');
  assert.ok(sampled.evidence > 0 && sampled.evidence < 4, 'fixture must remain below the normal contact retention threshold');
  assert.equal(sampled.visibleNow, false, 'weak cue is not an exactly visible enemy');
  assert.equal(sampled.observedNow, false, 'weak cue is not yet an observed contact');
  assert.ok(
    unit.tacticalKnowledge.threats.some((threat) => threat.id === `unit:${target.id}`),
    'weak cue must feed the danger layer',
  );

  state.simulationTimeSeconds = 1.1;
  tickSelectedSoldierPerception(state, 0.1);
  syncSoldierThreatMemory(state, unit, 0.1);

  const held = unit.perceptionKnowledge.contacts.find((contact) => contact.stimulusId === `unit:${target.id}`);
  assert.ok(held, 'an imprecise visual marker must not disappear between scheduled rear checks');
  assert.equal(held.visibleNow, false);
  assert.equal(held.observedNow, false);
  assert.ok(
    unit.tacticalKnowledge.threats.some((threat) => threat.id === `unit:${target.id}`),
    'danger memory must not disappear between scheduled rear checks',
  );
}
