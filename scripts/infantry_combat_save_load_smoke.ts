import assert from 'node:assert/strict';
import { serializePhysicalActionCoordinatorState } from '../src/core/actions/PhysicalActionCoordinatorSerialization';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  equipPrimaryWeaponFromLoadout,
  requestSingleFireTask,
  serializeInfantryCombatUnitRuntime,
  serializeReferenceProjectileRuntimeState,
  tickInfantryCombatSimulation,
} from '../src/core/infantry-combat/runtime';
import { replaceSceneAtRuntimeResolution } from '../src/core/simulation/ResolutionAwareScene';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';
import {
  buildExportedScene,
  normalizeImportedScene,
  restoreImportedInfantryCombatState,
} from '../src/ui/SceneExport';

verifyCheckpointGroup();
console.log('Stage 7 diagnostic: second save/load checkpoint group passed.');

function verifyCheckpointGroup(): void {
  const checkpoints = [
    ['mid-flight', 1.72],
    ['before-impact', 1.732],
    ['after-impact', 1.734],
    ['mid-recovery', 1.8],
  ] as const;

  for (const [name, checkpointSeconds] of checkpoints) {
    const original = readyScenario(`save-${name}`);
    advance(original.state, checkpointSeconds);
    const loaded = roundTrip(original.state);
    assert.deepEqual(stage3Snapshot(loaded), stage3Snapshot(original.state), `${name}: checkpoint must restore exactly`);

    const continuationSeconds = 2.2 - checkpointSeconds;
    advance(original.state, continuationSeconds);
    advance(loaded, continuationSeconds);
    assert.deepEqual(stage3Snapshot(loaded), stage3Snapshot(original.state), `${name}: continuation must remain exact`);
    const shooter = loaded.units[0]!;
    assert.equal(shooter.infantryCombatRuntime.primaryWeapon?.roundsInWeapon, 4, `${name}: exactly one round`);
    assert.equal(loaded.infantryCombatProjectiles.committedShots.length, 1, `${name}: exactly one commitment`);
    assert.equal(loaded.infantryCombatProjectiles.impacts.length, 1, `${name}: exactly one impact`);
    assert.equal(loaded.infantryCombatProjectiles.activeProjectiles.length, 0, `${name}: projectile terminated`);
  }
}

function roundTrip(state: SimulationState): SimulationState {
  return restoreExport(buildExportedScene(state));
}

function restoreExport(exported: ReturnType<typeof buildExportedScene>): SimulationState {
  const scene = normalizeImportedScene(structuredClone(exported));
  const loaded = createInitialState(baseMap(), []);
  replaceSceneAtRuntimeResolution(loaded, scene.map, scene.units, scene.pressureZones);
  restoreImportedInfantryCombatState(loaded, scene);
  return loaded;
}

function advance(state: SimulationState, deltaSeconds: number): void {
  if (deltaSeconds <= 0) return;
  const intervalStartSeconds = state.simulationTimeSeconds;
  state.simulationTimeSeconds = canonicalSeconds(intervalStartSeconds + deltaSeconds);
  tickInfantryCombatSimulation(state, { intervalStartSeconds, deltaSeconds });
}

function stage3Snapshot(state: SimulationState): unknown {
  return {
    simulationTimeSeconds: state.simulationTimeSeconds,
    units: [...state.units].sort((a, b) => a.id.localeCompare(b.id)).map((unit) => ({
      id: unit.id,
      runtime: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
      coordinator: serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
    })),
    projectiles: serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles),
  };
}

function readyScenario(id: string): { state: SimulationState; shooter: UnitModel } {
  const state = createInitialState({
    ...baseMap(),
    objects: [{
      id: 'save-wall',
      kind: 'structure',
      x: 4,
      y: 2,
      widthCells: 0.25,
      heightCells: 1,
      losHeightMeters: 3,
    }],
  }, [{ id, side: 'blue', x: 2, y: 2, type: 'infantry_squad' }]);
  const shooter = state.units[0]!;
  assert.equal(equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_rifleman', revision: 1 },
  ).status, 'equipped');
  assert.equal(requestSingleFireTask(shooter, {
    owner: { source: 'test', id: `${id}-owner` },
    ownerToken: `${id}-token`,
    target: { xMetres: 30, yMetres: 4, zMetres: 1.35 },
    mode: 'single',
    minimumSolutionQuality: 0.55,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  }).status, 'started');
  return { state, shooter };
}

function baseMap() {
  return {
    width: 30,
    height: 10,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field' as const,
    defaultHeight: 0,
  };
}

function canonicalSeconds(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}
