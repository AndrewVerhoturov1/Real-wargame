import assert from 'node:assert/strict';
import { getPhysicalActionCoordinatorDiagnostics } from '../src/core/actions/PhysicalActionCoordinator';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import { equipPrimaryWeaponFromLoadout, requestSingleFireTask, tickInfantryCombatSimulation } from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';

verifyExplicitEndToEndPipeline();
console.log('Stage 7 diagnostic: complete explicit pipeline passed.');

function verifyExplicitEndToEndPipeline(): void {
  const { state, shooter } = readyScenario('pipeline-explicit');
  const roundsBefore = shooter.infantryCombatRuntime.primaryWeapon!.roundsInWeapon;
  const result = tickInfantryCombatSimulation(state, { intervalStartSeconds: 0, deltaSeconds: 2.1 });
  assert.equal(result.commitResults.length, 1);
  assert.equal(result.commitResults[0]?.status, 'committed');
  assert.equal(shooter.infantryCombatRuntime.primaryWeapon!.roundsInWeapon, roundsBefore - 1);
  assert.equal(state.infantryCombatProjectiles.committedShots.length, 1);
  assert.equal(state.infantryCombatProjectiles.activeProjectiles.length, 0);
  assert.equal(state.infantryCombatProjectiles.impacts.length, 1);
  assert.equal(state.infantryCombatProjectiles.impacts[0]?.hitObjectId, 'pipeline-wall');
  assert.equal(shooter.infantryCombatRuntime.activeFireTask, null);
  assert.equal(shooter.infantryCombatRuntime.lastFireResult?.phase, 'completed');
  assert.equal(shooter.infantryCombatRuntime.lastFireResult?.committedShotId, 'pipeline-explicit:shot:1');
  assert.deepEqual(getPhysicalActionCoordinatorDiagnostics(shooter).activeLeases, []);
}

function readyScenario(id: string): { state: SimulationState; shooter: UnitModel } {
  const state = createInitialState({
    width: 30, height: 10, cellSize: 20, metersPerCell: 2,
    defaultTerrain: 'field', defaultHeight: 0,
    objects: [{ id: 'pipeline-wall', kind: 'structure', x: 4, y: 2, widthCells: 0.25, heightCells: 1, losHeightMeters: 3 }],
  }, [{ id, side: 'blue', x: 2, y: 2, type: 'infantry_squad' }]);
  const shooter = state.units[0]!;
  const equipped = equipPrimaryWeaponFromLoadout(shooter, createDefaultCombatCatalogRegistry(), { definitionId: 'loadout_rifleman', revision: 1 });
  assert.equal(equipped.status, 'equipped');
  const requested = requestSingleFireTask(shooter, {
    owner: { source: 'test', id: `${id}-owner` }, ownerToken: `${id}-token`,
    target: { xMetres: 30, yMetres: 4, zMetres: 1.35 }, targetRadiusMetres: 0,
    mode: 'single', minimumSolutionQuality: 0.55, maximumFriendlyFireRisk: 0, requestedSeconds: 0,
  });
  assert.equal(requested.status, 'started');
  return { state, shooter };
}
