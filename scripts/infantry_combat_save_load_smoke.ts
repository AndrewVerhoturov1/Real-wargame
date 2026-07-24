import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  equipPrimaryWeaponFromLoadout,
  requestSingleFireTask,
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

verifyAfterImpactEventLedgers();
console.log('Stage 7 diagnostic: after-impact event ledgers round-trip passed.');

function verifyAfterImpactEventLedgers(): void {
  const original = readyScenario('save-after-impact');
  advance(original.state, 1.734);
  const loaded = roundTrip(original.state);
  const loadedSnapshot = serializeReferenceProjectileRuntimeState(loaded.infantryCombatProjectiles);
  const originalSnapshot = serializeReferenceProjectileRuntimeState(original.state.infantryCombatProjectiles);
  assert.deepEqual(eventLedgers(loadedSnapshot), eventLedgers(originalSnapshot));
}

function eventLedgers(snapshot: ReturnType<typeof serializeReferenceProjectileRuntimeState>) {
  return {
    impacts: snapshot.impacts,
    terminations: snapshot.terminations,
    appliedImpactIds: snapshot.appliedImpactIds,
  };
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
  const intervalStartSeconds = state.simulationTimeSeconds;
  state.simulationTimeSeconds = canonicalSeconds(intervalStartSeconds + deltaSeconds);
  tickInfantryCombatSimulation(state, { intervalStartSeconds, deltaSeconds });
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
