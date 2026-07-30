import type { DefinitionRef } from '../../../infantry-combat/catalogs/CombatCatalogTypes';
import { CombatCatalogRegistry, createDefaultCombatCatalogRegistry } from '../../../infantry-combat/catalogs/CombatCatalogRegistry';
import {
  aggregateWoundCandidate,
  createUnitPhysiologyRuntime,
  createUnitWoundRuntime,
  deriveBloodState,
  equipPrimaryWeaponFromLoadout,
  normalizeUnitPhysiologyRuntime,
  normalizeUnitSuppressionRuntime,
  normalizeUnitWoundRuntime,
  serializeUnitPhysiologyRuntime,
  serializeUnitSuppressionRuntime,
  serializeUnitWoundRuntime,
  totalWoundBleedingRatePerSecond,
} from '../../../infantry-combat/runtime';
import { applyInitialStateToRuntime, type UnitModel } from '../../../units/UnitModel';
import type { CombatLabParticipantScenePatchV1, CombatLabInitialHealthV1, CombatLabInitialWoundV1 } from './CombatLabParticipantSceneTypes';
import { CombatLabParticipantSceneError } from './CombatLabParticipantSceneTypes';
import { assertFiniteRange, assertIntegerRange, increment } from './CombatLabParticipantSceneSupport';

export interface CombatLabParticipantStableRuntimeV1 {
  readonly loadoutRef: DefinitionRef | null;
  readonly loadedRounds: number;
  readonly reserveRoundsByAmmoDefinitionId: Readonly<Record<string, number>>;
  readonly firstAidCharges: number;
  readonly wounds: ReturnType<typeof serializeUnitWoundRuntime>;
  readonly physiology: ReturnType<typeof serializeUnitPhysiologyRuntime>;
  readonly suppression: ReturnType<typeof serializeUnitSuppressionRuntime>;
}

export function applyPublishedLoadout(
  unit: UnitModel,
  ref: DefinitionRef,
  registry: CombatCatalogRegistry = createDefaultCombatCatalogRegistry(),
): void {
  applyLoadout(unit, ref, registry, true);
}

export function applyExistingLoadout(
  unit: UnitModel,
  ref: DefinitionRef,
  registry: CombatCatalogRegistry = createDefaultCombatCatalogRegistry(),
): void {
  applyLoadout(unit, ref, registry, false);
}

function applyLoadout(unit: UnitModel, ref: DefinitionRef, registry: CombatCatalogRegistry, requirePublished: boolean): void {
  let loadout; let weapon; let ammo;
  try {
    loadout = registry.resolveLoadout(ref);
    weapon = registry.resolveWeapon(loadout.primary.definition);
    ammo = registry.resolveAmmo(weapon.ammo);
  } catch {
    throw new CombatLabParticipantSceneError('combat_lab_participant_loadout_missing', 'Точная ревизия комплекта вооружения не найдена.');
  }
  if (loadout.status === 'draft' || weapon.status === 'draft' || ammo.status === 'draft') {
    throw new CombatLabParticipantSceneError('combat_lab_participant_loadout_not_published', 'Draft-ревизии комплекта, оружия или патрона запрещены.');
  }
  if (requirePublished && (loadout.status !== 'published' || weapon.status !== 'published' || ammo.status !== 'published')) {
    throw new CombatLabParticipantSceneError('combat_lab_participant_loadout_not_published', 'Для начальной сцены разрешены только опубликованные комплект, оружие и патрон.');
  }
  const result = equipPrimaryWeaponFromLoadout(unit, registry, ref);
  if (!result.ok) throw new CombatLabParticipantSceneError(result.reasonCode, result.reasonRu);
}

export function captureCombatLabParticipantStableRuntime(unit: UnitModel): CombatLabParticipantStableRuntimeV1 {
  const runtime = unit.infantryCombatRuntime;
  return Object.freeze({
    loadoutRef: runtime.ammoInventory.loadoutRef ? Object.freeze({ ...runtime.ammoInventory.loadoutRef }) : null,
    loadedRounds: runtime.primaryWeapon?.roundsInWeapon ?? 0,
    reserveRoundsByAmmoDefinitionId: Object.freeze(Object.fromEntries(runtime.ammoInventory.reserves.map((entry) => [entry.ammoDefinitionId, entry.rounds]))),
    firstAidCharges: runtime.medical.firstAidCharges,
    wounds: serializeUnitWoundRuntime(runtime.wounds),
    physiology: serializeUnitPhysiologyRuntime(runtime.physiology),
    suppression: serializeUnitSuppressionRuntime(runtime.suppression),
  });
}

/** Uses the production initial-state reset to remove every transient action. */
export function resetCombatLabParticipantForInitialEdit(unit: UnitModel): void {
  applyInitialStateToRuntime(unit, false);
  unit.playerCommand = null;
  unit.plan = null;
  unit.order = null;
}

export function restoreCombatLabParticipantStableRuntime(
  unit: UnitModel,
  stable: CombatLabParticipantStableRuntimeV1,
  registry: CombatCatalogRegistry = createDefaultCombatCatalogRegistry(),
): void {
  if (stable.loadoutRef) {
    applyExistingLoadout(unit, stable.loadoutRef, registry);
    applyAmmoAndAid(unit, {
      loadedRounds: stable.loadedRounds,
      reserveRoundsByAmmoDefinitionId: stable.reserveRoundsByAmmoDefinitionId,
      firstAidCharges: stable.firstAidCharges,
    });
  }
  unit.infantryCombatRuntime.wounds = normalizeUnitWoundRuntime(stable.wounds);
  unit.infantryCombatRuntime.physiology = normalizeUnitPhysiologyRuntime(stable.physiology);
  unit.infantryCombatRuntime.suppression = normalizeUnitSuppressionRuntime(stable.suppression);
}

export function applyAmmoAndAid(unit: UnitModel, patch: CombatLabParticipantScenePatchV1): void {
  const runtime = unit.infantryCombatRuntime;
  if (patch.loadedRounds !== undefined) {
    const weapon = runtime.primaryWeapon;
    if (!weapon) throw new CombatLabParticipantSceneError('combat_lab_participant_weapon_missing', 'Нельзя задать патроны в оружии без опубликованного комплекта.');
    assertIntegerRange(patch.loadedRounds, 0, weapon.resolved.weapon.capacityRounds, 'Число патронов в оружии выходит за вместимость.');
    weapon.roundsInWeapon = patch.loadedRounds;
  }
  if (patch.reserveRoundsByAmmoDefinitionId !== undefined) {
    for (const [ammoDefinitionId, rounds] of Object.entries(patch.reserveRoundsByAmmoDefinitionId)) {
      const reserve = runtime.ammoInventory.reserves.find((entry) => entry.ammoDefinitionId === ammoDefinitionId);
      if (!reserve) throw new CombatLabParticipantSceneError('combat_lab_participant_ammo_incompatible', `Патрон «${ammoDefinitionId}» несовместим с выбранным комплектом.`);
      assertIntegerRange(rounds, 0, reserve.maximumRounds, `Запас патронов «${ammoDefinitionId}» превышает максимум комплекта.`);
      reserve.rounds = rounds;
    }
    runtime.ammoInventory.revision = increment(runtime.ammoInventory.revision);
  }
  if (patch.firstAidCharges !== undefined) {
    assertIntegerRange(patch.firstAidCharges, 0, runtime.medical.maximumFirstAidCharges, 'Число средств первой помощи превышает максимум комплекта.');
    runtime.medical.firstAidCharges = patch.firstAidCharges;
  }
}

export function applyInitialHealth(unit: UnitModel, health: CombatLabInitialHealthV1, simulationSeconds: number, roleId: string): void {
  if (health.mode === 'preserve_current') return;
  unit.infantryCombatRuntime.wounds = createUnitWoundRuntime();
  const previousFatigue = structuredClone(unit.infantryCombatRuntime.physiology.fatigue);
  unit.infantryCombatRuntime.physiology = createUnitPhysiologyRuntime(simulationSeconds);
  unit.infantryCombatRuntime.physiology.fatigue = previousFatigue;
  if (health.mode === 'healthy') {
    unit.soldier.condition.health = 100;
    unit.initialState.health = 100;
    return;
  }
  assertFiniteRange(health.bloodLoss, 0, 1, 'Потеря крови должна находиться в диапазоне 0..1.');
  let runtime = unit.infantryCombatRuntime.wounds;
  for (const wound of normalizeWounds(health.wounds)) {
    for (let hitIndex = 0; hitIndex < wound.hitCount; hitIndex += 1) {
      const impactId = `combat-lab-initial:${roleId}:${wound.zone}:${wound.severity}:${hitIndex + 1}`;
      runtime = aggregateWoundCandidate(runtime, {
        schemaVersion: 1,
        impactId,
        shotId: impactId,
        projectileId: impactId,
        sourceUnitId: unit.id,
        affectedUnitId: unit.id,
        zone: wound.zone,
        severity: wound.severity,
        impactEnergyJoules: wound.severity === 'light' ? 80 : wound.severity === 'severe' ? 220 : 420,
        traumaScore: wound.severity === 'light' ? 0.2 : wound.severity === 'severe' ? 0.6 : 1,
        bleedingRatePerSecond: wound.severity === 'light' ? 0 : wound.severity === 'severe' ? 0.004 : 0.01,
        functionalPenalty: wound.severity === 'light' ? 0.1 : wound.severity === 'severe' ? 0.45 : 0.9,
        appliedSeconds: simulationSeconds,
      }).runtime;
    }
  }
  unit.infantryCombatRuntime.wounds = runtime;
  const blood = unit.infantryCombatRuntime.physiology.blood;
  blood.bloodLoss = health.bloodLoss;
  blood.pendingBloodLoss = 0;
  blood.currentBleedingRatePerSecond = totalWoundBleedingRatePerSecond(runtime);
  blood.state = deriveBloodState(health.bloodLoss);
  blood.lastAppliedDelta = 0;
  blood.lastStateChangeSeconds = simulationSeconds;
  const legacyHealth = blood.state === 'dead' ? 0 : blood.state === 'unconscious' ? 5 : Math.max(1, Math.round((1 - health.bloodLoss) * 100));
  unit.soldier.condition.health = legacyHealth;
  unit.initialState.health = legacyHealth;
}

export function applyPosture(unit: UnitModel, posture: 'standing' | 'crouched' | 'prone'): void {
  unit.initialState.posture = posture;
  unit.behaviorRuntime.previousPosture = posture;
  unit.behaviorRuntime.posture = posture;
}

function normalizeWounds(wounds: readonly CombatLabInitialWoundV1[]): readonly CombatLabInitialWoundV1[] {
  return wounds.map((wound) => {
    if (!isWoundZone(wound.zone) || !isWoundSeverity(wound.severity)) throw new CombatLabParticipantSceneError('combat_lab_participant_wound_invalid', 'У начального ранения указана неизвестная зона или тяжесть.');
    assertIntegerRange(wound.hitCount, 1, 100, 'Число попаданий в одной записи должно находиться в диапазоне 1..100.');
    return Object.freeze({ zone: wound.zone, severity: wound.severity, hitCount: wound.hitCount });
  });
}
function isWoundZone(value: string): value is CombatLabInitialWoundV1['zone'] { return value === 'head' || value === 'torso' || value === 'arms' || value === 'legs'; }
function isWoundSeverity(value: string): value is CombatLabInitialWoundV1['severity'] { return value === 'light' || value === 'severe' || value === 'critical'; }
