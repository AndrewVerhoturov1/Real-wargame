import { isPostureTransitionRunning } from '../actions/PostureTransition';
import type { UnitModel } from '../units/UnitModel';

export const DEFAULT_RIFLE_ID = 'rifle_mosin_v1';

export interface WeaponDefinition {
  id: string;
  label: string;
  labelRu: string;
  magazineCapacity: number;
  muzzleVelocityMetresPerSecond: number;
  effectiveRangeMetres: number;
  maximumRangeMetres: number;
  baseDispersionRadians: number;
  recoilPerShot: number;
  recoilRecoveryPerSecond: number;
  readyTimeSeconds: number;
  aimTimeSeconds: number;
  shotCycleSeconds: number;
  reloadTimeSeconds: number;
  recoveryTimeSeconds: number;
  soundLoudness: number;
  muzzleFlashEvidence: number;
}

export interface WeaponRuntimeState {
  weaponId: string;
  roundsLoaded: number;
  roundsReserve: number;
  ready: boolean;
  currentRecoil: number;
  nextAllowedShotSeconds: number;
}

const DEFINITIONS: Record<string, WeaponDefinition> = {
  [DEFAULT_RIFLE_ID]: {
    id: DEFAULT_RIFLE_ID,
    label: 'Mosin rifle',
    labelRu: 'Винтовка Мосина',
    magazineCapacity: 5,
    muzzleVelocityMetresPerSecond: 865,
    effectiveRangeMetres: 500,
    maximumRangeMetres: 1200,
    baseDispersionRadians: 0.0016,
    recoilPerShot: 0.42,
    recoilRecoveryPerSecond: 0.9,
    readyTimeSeconds: 0.25,
    aimTimeSeconds: 0.7,
    shotCycleSeconds: 1.25,
    reloadTimeSeconds: 2.8,
    recoveryTimeSeconds: 0.35,
    soundLoudness: 1,
    muzzleFlashEvidence: 1,
  },
};

const runtimeByUnit = new WeakMap<UnitModel, WeaponRuntimeState>();

export function getWeaponDefinition(weaponId = DEFAULT_RIFLE_ID): WeaponDefinition {
  return DEFINITIONS[weaponId] ?? DEFINITIONS[DEFAULT_RIFLE_ID];
}

export function createDefaultWeaponRuntime(totalRounds = 30): WeaponRuntimeState {
  const definition = getWeaponDefinition();
  const total = Math.max(0, Math.round(totalRounds));
  const roundsLoaded = Math.min(definition.magazineCapacity, total);
  return {
    weaponId: definition.id,
    roundsLoaded,
    roundsReserve: Math.max(0, total - roundsLoaded),
    ready: roundsLoaded > 0,
    currentRecoil: 0,
    nextAllowedShotSeconds: 0,
  };
}

export function getWeaponRuntime(unit: UnitModel): WeaponRuntimeState {
  let runtime = runtimeByUnit.get(unit);
  if (!runtime) {
    runtime = createDefaultWeaponRuntime(unit.behaviorRuntime.ammo);
    runtime.ready = unit.behaviorRuntime.weaponReady && runtime.roundsLoaded > 0;
    runtimeByUnit.set(unit, runtime);
  }
  syncLegacyWeaponFields(unit, runtime);
  return runtime;
}

export function replaceWeaponRuntime(unit: UnitModel, runtime: WeaponRuntimeState): void {
  const definition = getWeaponDefinition(runtime.weaponId);
  const normalized: WeaponRuntimeState = {
    weaponId: definition.id,
    roundsLoaded: clampRounds(runtime.roundsLoaded, definition.magazineCapacity),
    roundsReserve: Math.max(0, Math.round(runtime.roundsReserve)),
    ready: Boolean(runtime.ready) && runtime.roundsLoaded > 0,
    currentRecoil: Math.max(0, runtime.currentRecoil),
    nextAllowedShotSeconds: Math.max(0, runtime.nextAllowedShotSeconds),
  };
  runtimeByUnit.set(unit, normalized);
  syncLegacyWeaponFields(unit, normalized);
}

export function tryConsumeRound(unit: UnitModel, nowSeconds: number): boolean {
  const runtime = getWeaponRuntime(unit);
  const definition = getWeaponDefinition(runtime.weaponId);
  if (!runtime.ready || runtime.roundsLoaded <= 0 || nowSeconds < runtime.nextAllowedShotSeconds) return false;
  runtime.roundsLoaded -= 1;
  runtime.currentRecoil += definition.recoilPerShot;
  runtime.nextAllowedShotSeconds = nowSeconds + definition.shotCycleSeconds;
  runtime.ready = runtime.roundsLoaded > 0;
  syncLegacyWeaponFields(unit, runtime);
  return true;
}

export function reloadWeapon(unit: UnitModel): number {
  if (isPostureTransitionRunning(unit)) {
    unit.behaviorRuntime.reason = 'Перезарядка запрещена во время физической смены позы.';
    unit.behaviorRuntime.lastEvent = 'combat_reload_rejected_posture_transition';
    return 0;
  }
  const runtime = getWeaponRuntime(unit);
  const definition = getWeaponDefinition(runtime.weaponId);
  const need = Math.max(0, definition.magazineCapacity - runtime.roundsLoaded);
  const moved = Math.min(need, runtime.roundsReserve);
  runtime.roundsLoaded += moved;
  runtime.roundsReserve -= moved;
  runtime.ready = runtime.roundsLoaded > 0;
  syncLegacyWeaponFields(unit, runtime);
  return moved;
}

export function recoverWeapon(unit: UnitModel, deltaSeconds: number): void {
  const runtime = getWeaponRuntime(unit);
  const definition = getWeaponDefinition(runtime.weaponId);
  runtime.currentRecoil = Math.max(0, runtime.currentRecoil - definition.recoilRecoveryPerSecond * Math.max(0, deltaSeconds));
  if (runtime.roundsLoaded > 0) runtime.ready = true;
  syncLegacyWeaponFields(unit, runtime);
}

export function syncLegacyWeaponFields(unit: UnitModel, runtime = getWeaponRuntimeUnsafe(unit)): void {
  if (!runtime) return;
  unit.behaviorRuntime.ammo = runtime.roundsLoaded + runtime.roundsReserve;
  unit.behaviorRuntime.weaponReady = runtime.ready && runtime.roundsLoaded > 0;
}

export function clearWeaponRuntime(unit: UnitModel): void {
  if (isPostureTransitionRunning(unit)) return;
  runtimeByUnit.delete(unit);
}

function getWeaponRuntimeUnsafe(unit: UnitModel): WeaponRuntimeState | undefined {
  return runtimeByUnit.get(unit);
}

function clampRounds(value: number, capacity: number): number {
  return Math.max(0, Math.min(capacity, Math.round(value)));
}
