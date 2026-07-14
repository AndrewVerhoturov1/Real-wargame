import assert from 'node:assert/strict';
import { recordCombatThreatEvidence, type CombatThreatEvidence } from '../src/core/combat/CombatThreatEvidence';
import { syncSoldierThreatMemory } from '../src/core/knowledge/SoldierThreatMemory';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';

const state = makeState();
const observer = unit(state, 'blue-1');
const shooter = unit(state, 'red-1');

recordCombatThreatEvidence(observer, makeEvidence(
  state,
  'same-source-opposite-a',
  10,
  { x: 3, y: 2 },
  shooter.id,
));
recordCombatThreatEvidence(observer, makeEvidence(
  state,
  'same-source-opposite-b',
  190,
  { x: 26, y: 14 },
  shooter.id,
));

syncSoldierThreatMemory(state, observer, 0.1);

const unknowns = observer.tacticalKnowledge.threats
  .filter((threat) => threat.id.startsWith('unknown-fire:'))
  .sort((left, right) => left.directionDegrees - right.directionDegrees);

assert.equal(
  unknowns.length,
  2,
  'same non-empty sourceUnitId must not collapse distant opposite-direction fire evidence before one sync',
);
assert.equal(new Set(unknowns.map((threat) => threat.id)).size, 2);
assert.deepEqual(unknowns.map((threat) => threat.directionDegrees), [10, 190]);
assert.deepEqual(unknowns.map((threat) => threat.evidenceCount), [1, 1]);

console.log('Combat threat evidence source-direction regression smoke passed.');

function makeEvidence(
  stateValue: SimulationState,
  id: string,
  directionDegrees: number,
  estimatedSourcePosition: { x: number; y: number },
  sourceUnitId: string,
): CombatThreatEvidence {
  return {
    id,
    kind: 'near_miss',
    sourceUnitId,
    estimatedSourcePosition: { ...estimatedSourcePosition },
    directionDegrees,
    confidence: 55,
    uncertaintyCells: 4,
    strength: 60,
    suppression: 58,
    stressPerSecond: 7,
    rangeCells: 80,
    arcDegrees: 52,
    createdSeconds: stateValue.simulationTimeSeconds,
    lastUpdatedSeconds: stateValue.simulationTimeSeconds,
    evidenceCount: 1,
  };
}

function makeState(): SimulationState {
  return createInitialState({
    width: 30,
    height: 16,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: 'blue-1', label: 'Blue', type: 'infantry_squad', side: 'blue', x: 15, y: 8 },
    { id: 'red-1', label: 'Red', type: 'infantry_squad', side: 'red', x: 4, y: 8 },
  ]);
}

function unit(stateValue: SimulationState, id: string): UnitModel {
  const found = stateValue.units.find((candidate) => candidate.id === id);
  assert.ok(found, `unit ${id} must exist`);
  return found;
}
