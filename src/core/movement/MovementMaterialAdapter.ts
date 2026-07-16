import type { GridPosition } from '../geometry';
import { getCell } from '../map/MapModel';
import { resolveCellVegetationDefinition } from '../map/VegetationDefinition';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { MovementProfile } from './MovementProfileTypes';

export interface MovementMaterialFactors {
  passable: boolean;
  speedMultiplier: number;
  noiseMultiplier: number;
  visibilityMultiplier: number;
  source: 'material_profile_provider' | 'legacy_fallback';
}

export type MovementMaterialProfileProvider = (input: {
  state: SimulationState;
  unit: UnitModel;
  position: GridPosition;
  profile: MovementProfile;
}) => Omit<MovementMaterialFactors, 'source'>;

export function resolveMovementMaterialFactors(
  state: SimulationState,
  unit: UnitModel,
  position: GridPosition,
  profile: MovementProfile,
): MovementMaterialFactors {
  const provider = state.movementMaterialProfileProvider;
  if (provider) {
    const resolved = provider({ state, unit, position, profile });
    return {
      passable: resolved.passable !== false,
      speedMultiplier: clamp(resolved.speedMultiplier, 0, 4),
      noiseMultiplier: clamp(resolved.noiseMultiplier, 0, 4),
      visibilityMultiplier: clamp(resolved.visibilityMultiplier, 0, 4),
      source: 'material_profile_provider',
    };
  }
  return resolveLegacyMovementMaterialFactors(state, position);
}

/**
 * Compatibility only until PR #130's canonical material-profile provider is wired.
 * New terrain/material coefficients must not be added here.
 */
export function resolveLegacyMovementMaterialFactors(
  state: SimulationState,
  position: GridPosition,
): MovementMaterialFactors {
  const cell = getCell(state.map, Math.floor(position.x), Math.floor(position.y));
  if (!cell) return { passable: false, speedMultiplier: 0, noiseMultiplier: 1, visibilityMultiplier: 1, source: 'legacy_fallback' };
  const terrainSpeed = cell.terrain === 'road' ? 1.08
    : cell.terrain === 'rough' ? 0.78
      : cell.terrain === 'swamp' ? 0.55
        : cell.terrain === 'water' ? 0
          : 1;
  const vegetation = resolveCellVegetationDefinition(cell).movement.baseResistance;
  return {
    passable: cell.terrain !== 'water',
    speedMultiplier: clamp(terrainSpeed / Math.max(1, vegetation), 0, 1.2),
    noiseMultiplier: clamp(1 + Math.max(0, vegetation - 1) * 0.12, 0.5, 2),
    visibilityMultiplier: cell.terrain === 'field' || cell.terrain === 'road' ? 1.1 : 1,
    source: 'legacy_fallback',
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : minimum;
}
