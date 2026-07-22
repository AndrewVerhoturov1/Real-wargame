import assert from 'node:assert/strict';
import { evaluateFireRequest, getMuzzlePoint } from '../src/core/combat/CombatDecision';
import { resolveDirectFireSolution } from '../src/core/combat/DirectFireSolution';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { sampleSmoothHeightLevel } from '../src/core/terrain/SmoothTerrain';
import { soldierPostureHeightMeters } from '../src/core/visibility/VisibilityPosture';
import { probeTargetVisibility } from '../src/core/visibility/VisibilityTargetProbe';
import type { UnitModel } from '../src/core/units/UnitModel';

const state = createInitialState(
  {
    width: 20,
    height: 12,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  },
  [
    {
      id: 'blue-1',
      label: 'Blue rifleman',
      labelRu: 'Синий стрелок',
      type: 'infantry_squad',
      side: 'blue',
      x: 3,
      y: 5,
      facingDegrees: 0,
      viewRangeCells: 20,
      runtime: { ammo: 5, weaponReady: true },
    },
    {
      id: 'red-1',
      label: 'Red rifleman',
      labelRu: 'Красный стрелок',
      type: 'infantry_squad',
      side: 'red',
      x: 8,
      y: 5,
      facingDegrees: 180,
      viewRangeCells: 20,
      runtime: { ammo: 5, weaponReady: true },
    },
  ],
);

const shooter = state.units.find((unit) => unit.id === 'blue-1')!;
const target = state.units.find((unit) => unit.id === 'red-1')!;
installIdentifiedContact(shooter, target);

for (let y = 4; y <= 6; y += 1) {
  for (let x = 4; x <= 6; x += 1) {
    state.map.cells[y * state.map.width + x]!.height = 0.75;
  }
}

const eyeHeight = soldierPostureHeightMeters(shooter.behaviorRuntime.posture);
const localGroundMetres = sampleSmoothHeightLevel(state.map, shooter.position.x, shooter.position.y) * 2;
const muzzle = getMuzzlePoint(state, shooter);
const muzzleHeightAboveGround = muzzle.zMetres - localGroundMetres;
assert.ok(
  eyeHeight - muzzleHeightAboveGround >= 0.04 && eyeHeight - muzzleHeightAboveGround <= 0.1,
  `shouldered rifle muzzle must stay close below eye line; eye=${eyeHeight}, muzzle=${muzzleHeightAboveGround}`,
);

const visibility = probeTargetVisibility(
  state.map,
  shooter,
  target.position,
  soldierPostureHeightMeters(target.behaviorRuntime.posture),
);
assert.equal(visibility.blocked, false, 'the upper silhouette must remain visible over the crest');
assert.ok(
  visibility.samples.some((sample) => sample.heightFraction === 0.9 && !sample.trace.hardBlocked),
  'the 90% silhouette sample must be visible',
);

const decision = evaluateFireRequest(state, shooter, shooter.perceptionKnowledge.contacts[0]!.id);
assert.equal(decision.allowed, true);
assert.ok(decision.target);
const resolution = resolveDirectFireSolution(state, shooter, decision.target, 500);
assert.ok(resolution.solution, 'a visible upper silhouette must provide a valid direct-fire solution');
assert.ok(
  resolution.solution.aimHeightMetres >= 1.45,
  `the solution must aim at the exposed upper silhouette, got ${resolution.solution.aimHeightMetres}`,
);
assert.equal(resolution.solution.line.clear, true);

function installIdentifiedContact(observer: UnitModel, contactTarget: UnitModel): void {
  observer.perceptionKnowledge.contacts = [{
    id: `perception:unit:${contactTarget.id}`,
    stimulusId: `unit:${contactTarget.id}`,
    sourceUnitId: contactTarget.id,
    labelRu: contactTarget.labels.ru,
    stage: 'confirmed',
    source: 'visual',
    evidence: 180,
    confidence: 100,
    uncertaintyCells: 0,
    lastKnownPosition: { ...contactTarget.position },
    visibleNow: true,
    observedNow: true,
    lastObservedSeconds: state.simulationTimeSeconds,
    lastUpdatedSeconds: state.simulationTimeSeconds,
    evidencePerSecond: 100,
    detectionVariance: 1,
    explanationRu: ['Проверочный подтверждённый визуальный контакт.'],
  }];
  observer.perceptionKnowledge.revision += 1;
}

console.log('Direct fire line smoke passed.');
