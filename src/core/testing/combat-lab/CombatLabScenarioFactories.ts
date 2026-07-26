import { createDefaultCombatCatalogRegistry } from '../../infantry-combat/catalogs';
import {
  applyWoundCandidate,
  equipPrimaryWeaponFromLoadout,
  type WoundCandidateV1,
  type WoundSeverity,
} from '../../infantry-combat/runtime';
import { createInitialState } from '../../simulation/SimulationState';
import type { UnitData, UnitModel } from '../../units/UnitModel';
import type { CombatLabBuiltScenarioV1, CombatLabScenarioDefinitionV1 } from './CombatLabContracts';

const MAP_WIDTH_METRES = 230;
const MAP_HEIGHT_METRES = 90;
const METRES_PER_CELL = 1;

type LoadoutId =
  | 'loadout_rifleman'
  | 'loadout_submachine_gunner'
  | 'loadout_machine_gunner'
  | 'loadout_assistant_machine_gunner';

interface UnitFixture {
  readonly id: string;
  readonly titleRu: string;
  readonly side: 'blue' | 'red';
  readonly x: number;
  readonly y: number;
  readonly facingDegrees: number;
  readonly loadout?: LoadoutId;
}

export function buildCombatLabScenarioState(
  definition: CombatLabScenarioDefinitionV1,
  seed: number,
): CombatLabBuiltScenarioV1 {
  const fixtures = fixturesForFactory(definition.stateFactoryId);
  const commonYOffset = seededCommonOffset(seed);
  const unitsData: UnitData[] = fixtures.map((fixture) => ({
    id: fixture.id,
    side: fixture.side,
    x: fixture.x,
    y: fixture.y + commonYOffset,
    type: 'infantry_squad',
    facingDegrees: fixture.facingDegrees,
  }));
  const state = createInitialState({
    width: MAP_WIDTH_METRES,
    height: MAP_HEIGHT_METRES,
    cellSize: 5,
    metersPerCell: METRES_PER_CELL,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, unitsData);
  state.editor.enabled = false;
  state.editor.panelOpen = false;
  state.editor.lastMessage = `Combat Lab ${definition.scenarioId}@${definition.revision}; seed=${seed}`;

  const registry = createDefaultCombatCatalogRegistry();
  for (const fixture of fixtures) {
    const unit = requireUnit(state.units, fixture.id);
    unit.labels = { en: fixture.id, ru: fixture.titleRu };
    if (fixture.loadout) {
      const equipped = equipPrimaryWeaponFromLoadout(unit, registry, {
        definitionId: fixture.loadout,
        revision: 1,
      });
      if (!equipped.ok) throw new Error(`${definition.scenarioId}: cannot equip ${fixture.loadout}: ${equipped.reasonCode}`);
    }
  }

  applyScenarioInitialConditions(definition.stateFactoryId, state.units);
  const focusUnitId = definition.visualPreset.focusUnitId;
  state.selectedUnitId = state.units.some((unit) => unit.id === focusUnitId) ? focusUnitId : null;
  state.selectedUnitIds = state.selectedUnitId ? [state.selectedUnitId] : [];

  for (const role of definition.roles) requireUnit(state.units, role.unitId);
  return {
    definition,
    state,
    roles: definition.roles,
    controlDistances: definition.controlDistances,
    seed,
  };
}

function fixturesForFactory(factoryId: string): readonly UnitFixture[] {
  switch (factoryId) {
    case 'rifle-distance-v1':
      return [
        fixture('rifle-distance-shooter', 'Винтовочник', 'blue', 10, 40, 0, 'loadout_rifleman'),
        fixture('rifle-target-25', 'Мишень 25 м', 'red', 35, 40, 180),
        fixture('rifle-target-50', 'Мишень 50 м', 'red', 60, 40, 180),
        fixture('rifle-target-100', 'Мишень 100 м', 'red', 110, 40, 180),
        fixture('rifle-target-200', 'Мишень 200 м', 'red', 210, 40, 180),
      ];
    case 'rifle-moving-v1':
      return [
        fixture('moving-rifle-shooter', 'Винтовочник', 'blue', 20, 35, 0, 'loadout_rifleman'),
        fixture('moving-rifle-target', 'Движущаяся цель', 'red', 90, 35, 180),
      ];
    case 'ppsh-recoil-v1':
      return [
        fixture('ppsh-shooter', 'Стрелок с ППШ', 'blue', 10, 40, 0, 'loadout_submachine_gunner'),
        fixture('ppsh-target-15', 'Мишень 15 м', 'red', 25, 40, 180),
        fixture('ppsh-target-30', 'Мишень 30 м', 'red', 40, 40, 180),
        fixture('ppsh-target-60', 'Мишень 60 м', 'red', 70, 40, 180),
      ];
    case 'dp27-deployment-v1':
      return [
        fixture('dp-portable-gunner', 'Пулемётчик ДП-27', 'blue', 10, 40, 0, 'loadout_machine_gunner'),
        fixture('dp-portable-target-50', 'Мишень 50 м', 'red', 60, 40, 180),
        fixture('dp-portable-target-100', 'Мишень 100 м', 'red', 110, 40, 180),
        fixture('dp-portable-target-150', 'Мишень 150 м', 'red', 160, 40, 180),
        fixture('dp-portable-outside-sector', 'Мишень вне сектора', 'red', 90, 68, 180),
      ];
    case 'dp27-assistant-v1':
      return [
        fixture('dp-assistant-gunner', 'Пулемётчик', 'blue', 20, 40, 0, 'loadout_machine_gunner'),
        fixture('dp-assistant-helper', 'Помощник пулемётчика', 'blue', 21, 40, 0, 'loadout_assistant_machine_gunner'),
        fixture('dp-assistant-target', 'Мишень 100 м', 'red', 120, 40, 180),
      ];
    case 'wounds-first-aid-v1':
      return [
        fixture('medical-actor', 'Боец с аптечкой', 'blue', 20, 40, 0, 'loadout_rifleman'),
        fixture('medical-patient', 'Раненый боец', 'blue', 21, 40, 0, 'loadout_rifleman'),
        fixture('medical-fire-target', 'Контрольная мишень', 'red', 35, 40, 180),
      ];
    case 'suppression-events-v1':
      return [
        fixture('suppression-shooter', 'Стрелок с ППШ', 'blue', 10, 40, 0, 'loadout_submachine_gunner'),
        fixture('suppression-near-miss', 'Цель near miss', 'red', 54, 37.5, 180),
        fixture('suppression-near-impact', 'Цель near impact', 'red', 55, 40, 180),
        fixture('suppression-direct-hit', 'Цель direct hit', 'red', 56, 42.5, 180),
      ];
    case 'save-load-boundaries-v1':
      return [
        fixture('save-rifleman', 'Винтовочник', 'blue', 20, 25, 0, 'loadout_rifleman'),
        fixture('save-ppsh', 'Стрелок с ППШ', 'blue', 20, 35, 0, 'loadout_submachine_gunner'),
        fixture('save-gunner', 'Пулемётчик', 'blue', 20, 45, 0, 'loadout_machine_gunner'),
        fixture('save-assistant', 'Помощник', 'blue', 21, 45, 0, 'loadout_assistant_machine_gunner'),
        fixture('save-patient', 'Раненый', 'blue', 21, 55, 0, 'loadout_rifleman'),
        fixture('save-target', 'Мишень', 'red', 80, 25, 180),
      ];
    default:
      throw new Error(`Unknown Combat Lab state factory: ${factoryId}`);
  }
}

function applyScenarioInitialConditions(factoryId: string, units: UnitModel[]): void {
  if (factoryId === 'wounds-first-aid-v1') {
    const patient = requireUnit(units, 'medical-patient');
    applyWoundCandidate(patient.infantryCombatRuntime.wounds, wound('medical:head', patient.id, 'head', 'severe'));
    applyWoundCandidate(patient.infantryCombatRuntime.wounds, wound('medical:torso', patient.id, 'torso', 'critical'));
    applyWoundCandidate(patient.infantryCombatRuntime.wounds, wound('medical:arms', patient.id, 'arms', 'light'));
    applyWoundCandidate(patient.infantryCombatRuntime.wounds, wound('medical:legs', patient.id, 'legs', 'severe'));
  }
  if (factoryId === 'save-load-boundaries-v1') {
    const patient = requireUnit(units, 'save-patient');
    applyWoundCandidate(patient.infantryCombatRuntime.wounds, wound('save:torso', patient.id, 'torso', 'critical'));
    const ppsh = requireUnit(units, 'save-ppsh').infantryCombatRuntime.primaryWeapon;
    const gunner = requireUnit(units, 'save-gunner').infantryCombatRuntime.primaryWeapon;
    if (ppsh) ppsh.roundsInWeapon = Math.min(ppsh.roundsInWeapon, 5);
    if (gunner) gunner.roundsInWeapon = Math.min(gunner.roundsInWeapon, 5);
  }
  if (factoryId === 'dp27-assistant-v1') {
    const weapon = requireUnit(units, 'dp-assistant-gunner').infantryCombatRuntime.primaryWeapon;
    if (weapon) weapon.roundsInWeapon = Math.min(weapon.roundsInWeapon, 8);
  }
}

function fixture(id: string, titleRu: string, side: 'blue' | 'red', x: number, y: number, facingDegrees: number, loadout?: LoadoutId): UnitFixture {
  return { id, titleRu, side, x, y, facingDegrees, loadout };
}

function wound(
  impactId: string,
  affectedUnitId: string,
  zone: 'head' | 'torso' | 'arms' | 'legs',
  severity: WoundSeverity,
): WoundCandidateV1 {
  const severityFactor = severity === 'critical' ? 1 : severity === 'severe' ? 0.65 : 0.15;
  return {
    schemaVersion: 1,
    impactId,
    shotId: `${impactId}:shot`,
    projectileId: `${impactId}:projectile`,
    sourceUnitId: 'combat-lab-fixture',
    affectedUnitId,
    zone,
    severity,
    impactEnergyJoules: 1800,
    traumaScore: severityFactor,
    bleedingRatePerSecond: severity === 'critical' ? 0.0104 : severity === 'severe' ? 0.0039 : 0,
    functionalPenalty: severityFactor,
    appliedSeconds: 0,
  };
}

function seededCommonOffset(seed: number): number {
  const mixed = mixSeed(seed);
  return ((mixed % 17) - 8) * 0.02;
}

function mixSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

function requireUnit(units: readonly UnitModel[], unitId: string): UnitModel {
  const unit = units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Combat Lab unit is missing: ${unitId}`);
  return unit;
}
