import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  equipPrimaryWeaponFromLoadout,
  requestSingleFireTask,
  tickInfantryCombatSimulation,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

const ACTIVE_TASK_COUNT = 128;
const units = Array.from({ length: ACTIVE_TASK_COUNT }, (_, index) => ({
  id: `stage5-stress-${index.toString().padStart(3, '0')}`,
  side: 'blue' as const,
  x: 2 + (index % 16) * 2,
  y: 2 + Math.floor(index / 16) * 2,
  type: 'infantry_squad' as const,
  facingDegrees: 0,
}));
const state = createInitialState({
  width: 200,
  height: 80,
  cellSize: 10,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
}, units);
const registry = createDefaultCombatCatalogRegistry();
for (const unit of state.units) {
  assert.equal(equipPrimaryWeaponFromLoadout(unit, registry, {
    definitionId: 'loadout_rifleman',
    revision: 1,
  }).status, 'equipped');
  assert.equal(requestSingleFireTask(unit, {
    owner: { source: 'test', id: `${unit.id}-owner` },
    ownerToken: `${unit.id}-token`,
    target: { xMetres: 350, yMetres: unit.position.y * state.map.metersPerCell, zMetres: 1.35 },
    mode: 'single',
    minimumSolutionQuality: 1,
    maximumFriendlyFireRisk: 0,
    requestedSeconds: 0,
  }).status, 'started');
}

tickInfantryCombatSimulation(state, { intervalStartSeconds: 0, deltaSeconds: 1.05 });
const updateCounts = state.units.map((unit) => unit.infantryCombatRuntime.activeFireTask?.aimTracking.trackingUpdateCount ?? 0);
assert.equal(updateCounts.reduce((sum, count) => sum + count, 0), ACTIVE_TASK_COUNT * 5);
assert.ok(updateCounts.every((count) => count === 5));
assert.equal(state.infantryCombatProjectiles.committedShots.length, 0);
assert.equal(state.infantryCombatProjectiles.activeProjectiles.length, 0);

console.log(`Infantry combat Stage 5 tracking stress passed: ${ACTIVE_TASK_COUNT} active tasks, ${ACTIVE_TASK_COUNT * 5} deterministic updates, no excess tracking and no premature projectiles.`);
