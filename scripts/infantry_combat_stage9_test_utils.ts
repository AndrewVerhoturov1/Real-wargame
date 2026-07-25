import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import { equipPrimaryWeaponFromLoadout } from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';

export function createStage9State(): SimulationState {
  return createInitialState({
    width: 240,
    height: 80,
    cellSize: 20,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: 'gunner', side: 'blue', x: 10, y: 20, type: 'infantry_squad', facingDegrees: 0 },
    { id: 'helper', side: 'blue', x: 11, y: 20, type: 'infantry_squad', facingDegrees: 0 },
    { id: 'rifle', side: 'blue', x: 14, y: 20, type: 'infantry_squad', facingDegrees: 0 },
    { id: 'ppsh', side: 'blue', x: 17, y: 20, type: 'infantry_squad', facingDegrees: 0 },
    { id: 'enemy', side: 'red', x: 90, y: 20, type: 'infantry_squad', facingDegrees: 180 },
  ]);
}

export function equipStage9Roles(state: SimulationState): {
  gunner: UnitModel;
  helper: UnitModel;
  rifle: UnitModel;
  ppsh: UnitModel;
  enemy: UnitModel;
} {
  const registry = createDefaultCombatCatalogRegistry();
  const gunner = getUnit(state, 'gunner');
  const helper = getUnit(state, 'helper');
  const rifle = getUnit(state, 'rifle');
  const ppsh = getUnit(state, 'ppsh');
  const enemy = getUnit(state, 'enemy');
  assert.equal(equipPrimaryWeaponFromLoadout(gunner, registry, { definitionId: 'loadout_machine_gunner', revision: 1 }).status, 'equipped');
  assert.equal(equipPrimaryWeaponFromLoadout(helper, registry, { definitionId: 'loadout_assistant_machine_gunner', revision: 1 }).status, 'equipped');
  assert.equal(equipPrimaryWeaponFromLoadout(rifle, registry, { definitionId: 'loadout_rifleman', revision: 1 }).status, 'equipped');
  assert.equal(equipPrimaryWeaponFromLoadout(ppsh, registry, { definitionId: 'loadout_submachine_gunner', revision: 1 }).status, 'equipped');
  return { gunner, helper, rifle, ppsh, enemy };
}

export function deploymentRequest(id: string, helperUnitId: string | null, requestedSeconds = 0) {
  return {
    owner: { source: 'test' as const, id },
    ownerToken: `${id}-token`,
    helperUnitId,
    requestedSeconds,
  };
}

export function fireRequest(id: string, target: { xMetres: number; yMetres: number; zMetres: number }, mode: 'single' | 'short_burst' | 'long_burst' | 'suppress', radius = 0) {
  return {
    owner: { source: 'test' as const, id },
    ownerToken: `${id}-token`,
    target,
    targetRadiusMetres: radius,
    contactId: null,
    sourceUnitId: null,
    mode,
    minimumSolutionQuality: 0,
    maximumFriendlyFireRisk: 1,
    requestedSeconds: 0,
  };
}

export function getUnit(state: SimulationState, id: string): UnitModel {
  const unit = state.units.find((candidate) => candidate.id === id);
  assert.ok(unit, `Unit ${id} must exist.`);
  return unit;
}

export function targetPoint(unit: UnitModel, dxMetres: number, dyMetres: number, zMetres = 1): { xMetres: number; yMetres: number; zMetres: number } {
  return {
    xMetres: unit.position.x + dxMetres,
    yMetres: unit.position.y + dyMetres,
    zMetres,
  };
}
