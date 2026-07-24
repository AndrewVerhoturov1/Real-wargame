import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  equipPrimaryWeaponFromLoadout,
  requestSingleFireTask,
  serializeInfantryCombatUnitRuntime,
  tickInfantryCombatSimulation,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';

verifyCoarseAndFineUnitRuntimeMatch();

console.log('Infantry combat simulation partition probe passed: unit runtime matches.');

function verifyCoarseAndFineUnitRuntimeMatch(): void {
  const coarse = readyScenario('pipeline-partition');
  const fine = readyScenario('pipeline-partition');
  tickInfantryCombatSimulation(coarse.state, { intervalStartSeconds: 0, deltaSeconds: 2.1 });
  tickInfantryCombatSimulation(fine.state, { intervalStartSeconds: 0, deltaSeconds: 0.7 });
  tickInfantryCombatSimulation(fine.state, { intervalStartSeconds: 0.7, deltaSeconds: 0.4 });
  tickInfantryCombatSimulation(fine.state, { intervalStartSeconds: 1.1, deltaSeconds: 1 });

  assert.deepEqual(
    serializeInfantryCombatUnitRuntime(fine.shooter.infantryCombatRuntime),
    serializeInfantryCombatUnitRuntime(coarse.shooter.infantryCombatRuntime),
  );
}

function readyScenario(id: string): { state: SimulationState; shooter: UnitModel } {
  const state = createInitialState({
    width: 30,
    height: 10,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [{
      id: 'pipeline-wall',
      kind: 'structure',
      x: 4,
      y: 2,
      widthCells: 0.25,
      heightCells: 1,
      losHeightMeters: 3,
    }],
  }, [{ id, side: 'blue', x: 2, y: 2, type: 'infantry_squad' }]);
  const shooter = state.units[0]!;
  const equipped = equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_rifleman', revision: 1 },
  );
  assert.equal(equipped.status, 'equipped');
  const requested = requestSingleFireTask(shooter, {
    owner: { source: 'test', id: `${id}-owner` },
    ownerToken: `${id}-token`,
    target: { xMetres: 30, yMetres: 4, zMetres: 1.35 },
    targetRadiusMetres: 0,
    mode: 'single',
    minimumSolutionQuality: 0.55,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  });
  assert.equal(requested.status, 'started');
  return { state, shooter };
}
