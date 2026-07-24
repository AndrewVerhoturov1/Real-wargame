import { cancelPostureTransitionBySystem, getRunningPostureTransition } from '../../actions/PostureTransition';
import { getCombatUnitSpatialIndex, type CombatUnitIndex } from '../../combat/CombatUnitSpatialIndex';
import { cancelMovementWeaponPreparation } from '../../movement/MovementRuntime';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import { failActiveFireTask } from './FireTaskRuntime';
import type { ProjectileImpactV1 } from './ProjectileRuntimeTypes';
import {
  WOUND_CANDIDATE_SCHEMA_VERSION,
  type WoundApplicationResultV1,
  type WoundCandidateV1,
} from './InfantryBodyTypes';
import { aggregateWoundCandidate, bleedingRateForSeverity } from './WoundRuntime';
import { calculateWoundSeverity } from './WoundSeverity';

export interface WoundImpactApplyResult {
  readonly result: WoundApplicationResultV1;
  readonly target: UnitModel | null;
}

export interface WoundImpactCommandResult {
  readonly status: 'applied' | 'duplicate' | 'legacy_impact' | 'body_physics_missing' | 'target_unit_missing' | 'invalid_candidate' | 'slot_capacity_reached';
  readonly result: WoundApplicationResultV1;
  readonly target: UnitModel | null;
}

export function applyProjectileImpactWound(
  impact: ProjectileImpactV1,
  unitIndex: Pick<CombatUnitIndex, 'unitsById'>,
): WoundImpactApplyResult;
export function applyProjectileImpactWound(
  state: SimulationState,
  impact: ProjectileImpactV1,
): WoundImpactCommandResult;
export function applyProjectileImpactWound(
  first: ProjectileImpactV1 | SimulationState,
  second: Pick<CombatUnitIndex, 'unitsById'> | ProjectileImpactV1,
): WoundImpactApplyResult | WoundImpactCommandResult {
  if (isSimulationState(first)) {
    const applied = applyProjectileImpactWoundCore(second as ProjectileImpactV1, getCombatUnitSpatialIndex(first));
    return { status: commandStatus(applied.result), ...applied };
  }
  return applyProjectileImpactWoundCore(first, second as Pick<CombatUnitIndex, 'unitsById'>);
}

function applyProjectileImpactWoundCore(
  impact: ProjectileImpactV1,
  unitIndex: Pick<CombatUnitIndex, 'unitsById'>,
): WoundImpactApplyResult {
  if (impact.schemaVersion !== 2) return { result: noApplication('legacy_impact', impact), target: null };
  const body = impact.bodyPhysics;
  if (!body || impact.hitType !== 'unit' || !impact.hitUnitId) {
    return { result: noApplication('body_physics_missing', impact), target: null };
  }
  const target = unitIndex.unitsById.get(impact.hitUnitId) ?? null;
  if (!target) return { result: noApplication('target_unit_missing', impact), target: null };
  const severity = calculateWoundSeverity({
    impactId: impact.impactId,
    hitUnitId: target.id,
    hitZone: body.hitZone,
    impactEnergyJoules: body.impactEnergyJoules,
    woundEffectMultiplier: body.woundEffectMultiplier,
    incidenceCosine: body.incidenceCosine,
  });
  const candidate: WoundCandidateV1 = {
    schemaVersion: WOUND_CANDIDATE_SCHEMA_VERSION,
    impactId: impact.impactId,
    shotId: impact.shotId,
    projectileId: impact.projectileId,
    sourceUnitId: impact.shooterId,
    affectedUnitId: target.id,
    zone: body.hitZone,
    severity: severity.severity,
    impactEnergyJoules: body.impactEnergyJoules,
    traumaScore: severity.traumaScore,
    bleedingRatePerSecond: bleedingRateForSeverity(body.hitZone, severity.severity),
    functionalPenalty: severity.traumaScore / Math.max(1, severity.traumaScore + 1),
    appliedSeconds: impact.impactSeconds,
  };
  const applied = aggregateWoundCandidate(target.infantryCombatRuntime.wounds, candidate);
  target.infantryCombatRuntime.wounds = applied.runtime;
  if (applied.result.applied) enforceWoundCapabilities(target, impact.impactSeconds);
  return { result: applied.result, target };
}

export function enforceWoundCapabilities(unit: UnitModel, endedSeconds: number): void {
  const capabilities = unit.infantryCombatRuntime.wounds.capabilities;
  if (!capabilities.canUseWeapon) {
    failActiveFireTask(unit, {
      endedSeconds,
      resultCode: 'infantry_fire_task_weapon_capability_lost',
      resultRu: 'Огневая задача завершена: ранение лишило бойца способности пользоваться оружием.',
    });
  }
  if (!capabilities.canUseWeapon || !capabilities.canMove) {
    cancelMovementWeaponPreparation(
      unit,
      undefined,
      'movement_weapon_preparation_wound_capability_lost',
      !capabilities.canMove
        ? 'Подготовка движения отменена: ранение лишило бойца способности двигаться.'
        : 'Подготовка движения отменена: ранение лишило бойца способности пользоваться оружием.',
    );
  }
  if (!capabilities.canMove) {
    unit.order = null;
    unit.movementRuntime.isMoving = false;
    unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
  }
  const posture = getRunningPostureTransition(unit);
  if (posture && (!capabilities.conscious || !capabilities.alive || (!capabilities.canStand && posture.targetPosture === 'standing'))) {
    cancelPostureTransitionBySystem(
      unit,
      'posture_transition_wound_capability_lost',
      'Смена позы отменена: ранение больше не позволяет выполнить целевую позу.',
    );
  }
}

function noApplication(
  reason: WoundApplicationResultV1['reason'],
  impact: Pick<ProjectileImpactV1, 'impactId' | 'hitUnitId' | 'hitZone' | 'impactSeconds'>,
): WoundApplicationResultV1 {
  return {
    schemaVersion: 1,
    applied: false,
    reason,
    impactId: impact.impactId || null,
    affectedUnitId: impact.hitUnitId,
    zone: impact.hitZone,
    severity: null,
    revisionBefore: 0,
    revisionAfter: 0,
    appliedSeconds: Math.max(0, Number.isFinite(impact.impactSeconds) ? impact.impactSeconds : 0),
  };
}

function commandStatus(result: WoundApplicationResultV1): WoundImpactCommandResult['status'] {
  if (result.applied) return 'applied';
  if (result.reason === 'duplicate_impact') return 'duplicate';
  return result.reason;
}

function isSimulationState(value: ProjectileImpactV1 | SimulationState): value is SimulationState {
  return typeof value === 'object'
    && value !== null
    && 'infantryCombatProjectiles' in value
    && 'units' in value
    && 'map' in value;
}
