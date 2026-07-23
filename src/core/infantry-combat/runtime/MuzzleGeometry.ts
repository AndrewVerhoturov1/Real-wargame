import { normalizeDirection, type BallisticDirection3, type BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { TacticalMap } from '../../map/MapModel';
import { sampleSmoothHeightLevel } from '../../terrain/SmoothTerrain';
import type { UnitModel } from '../../units/UnitModel';
import type { InfantryWeaponInstanceV1 } from './InfantryCombatRuntimeTypes';

const ELEVATION_STEP_METRES = 2;
const DIRECTION_EPSILON_METRES = 1e-9;

export const POSTURE_MUZZLE_HEIGHT_METRES = Object.freeze({
  standing: 1.35,
  crouched: 0.92,
  prone: 0.3,
} as const);

export interface MuzzleGeometryV1 {
  readonly weaponAnchor: BallisticPoint3;
  readonly muzzle: BallisticPoint3;
  readonly target: BallisticPoint3;
  readonly weaponDirection: BallisticDirection3;
}

export function computeMuzzleGeometry(
  map: TacticalMap,
  unit: UnitModel,
  target: BallisticPoint3,
  weapon: InfantryWeaponInstanceV1,
): MuzzleGeometryV1 | null {
  if (!isFinitePoint(target)) return null;
  const weaponAnchor = getWeaponAnchor(map, unit);
  const dx = target.xMetres - weaponAnchor.xMetres;
  const dy = target.yMetres - weaponAnchor.yMetres;
  const dz = target.zMetres - weaponAnchor.zMetres;
  if (Math.hypot(dx, dy, dz) <= DIRECTION_EPSILON_METRES) return null;
  const weaponDirection = normalizeDirection({ x: dx, y: dy, z: dz });
  const offset = Math.max(0, finite(weapon.resolved.weapon.muzzleForwardOffsetMeters, 0));
  return {
    weaponAnchor,
    muzzle: {
      xMetres: weaponAnchor.xMetres + weaponDirection.x * offset,
      yMetres: weaponAnchor.yMetres + weaponDirection.y * offset,
      zMetres: weaponAnchor.zMetres + weaponDirection.z * offset,
    },
    target: { ...target },
    weaponDirection,
  };
}

export function getWeaponAnchor(map: TacticalMap, unit: UnitModel): BallisticPoint3 {
  const groundZMetres = sampleSmoothHeightLevel(map, unit.position.x, unit.position.y) * ELEVATION_STEP_METRES;
  return {
    xMetres: unit.position.x * map.metersPerCell,
    yMetres: unit.position.y * map.metersPerCell,
    zMetres: groundZMetres + POSTURE_MUZZLE_HEIGHT_METRES[unit.behaviorRuntime.posture],
  };
}

function isFinitePoint(value: BallisticPoint3): boolean {
  return Number.isFinite(value.xMetres) && Number.isFinite(value.yMetres) && Number.isFinite(value.zMetres);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
