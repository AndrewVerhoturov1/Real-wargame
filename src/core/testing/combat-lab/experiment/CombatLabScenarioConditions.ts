import { getEffectiveCombatCapabilities } from '../../../infantry-combat/runtime/EffectiveCombatCapabilities';
import type { SimulationState } from '../../../simulation/SimulationState';
import type { UnitModel } from '../../../units/UnitModel';
import type {
  CombatLabConditionV1,
  CombatLabExperimentV1,
  CombatLabScenarioRuntimeSnapshotV1,
  CombatLabStepRuntimeSnapshotV1,
} from './CombatLabExperimentContracts';

export interface CombatLabConditionContextV1 {
  readonly experiment: CombatLabExperimentV1;
  readonly state: SimulationState;
  readonly runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1;
  readonly experimentStartedSeconds: number;
  readonly stepStartedSeconds: number | null;
}

export function evaluateCombatLabCondition(
  condition: CombatLabConditionV1,
  context: CombatLabConditionContextV1,
): boolean {
  if (condition.kind === 'always') return true;
  if (condition.kind === 'elapsed') {
    const anchor = condition.anchor === 'step_start'
      ? context.stepStartedSeconds
      : context.experimentStartedSeconds;
    return anchor !== null && context.state.simulationTimeSeconds - anchor + 1e-9 >= condition.seconds;
  }
  if (condition.kind === 'step_state') {
    const step = findStepSnapshot(context.runtimeSnapshot, condition.trackId, condition.stepId);
    if (!step) return false;
    if (condition.state === 'started') return hasStepStarted(step);
    return step.state === condition.state;
  }
  if (condition.kind === 'contact') {
    const observer = resolveRoleUnit(context.experiment, context.state, condition.observerRoleId);
    const target = resolveRoleUnit(context.experiment, context.state, condition.targetRoleId);
    const present = Boolean(observer && target && observer.perceptionKnowledge.contacts.some((contact) => (
      contact.sourceUnitId === target.id
      && (contact.visibleNow || contact.observedNow || contact.confidence > 0)
    )));
    return present === condition.present;
  }
  const unit = resolveRoleUnit(context.experiment, context.state, condition.roleId);
  if (!unit) return false;
  if (condition.kind === 'role_state') return evaluateRoleState(unit, condition.state);
  if (condition.kind === 'ammo') {
    const rounds = totalUnitRounds(unit);
    if (condition.comparison === 'empty') return rounds <= 0;
    return condition.comparison === 'at_most' ? rounds <= condition.rounds : rounds >= condition.rounds;
  }
  const suppression = unit.infantryCombatRuntime.suppression.suppressionLevel;
  return condition.comparison === 'at_most'
    ? suppression <= condition.value + 1e-9
    : suppression + 1e-9 >= condition.value;
}

export function resolveCombatLabRoleUnit(
  experiment: CombatLabExperimentV1,
  state: SimulationState,
  roleId: string,
): UnitModel | null {
  return resolveRoleUnit(experiment, state, roleId);
}

export function totalCombatLabUnitRounds(unit: UnitModel): number {
  return totalUnitRounds(unit);
}

function evaluateRoleState(unit: UnitModel, state: Extract<CombatLabConditionV1, { readonly kind: 'role_state' }>['state']): boolean {
  const capabilities = getEffectiveCombatCapabilities(unit);
  const capable = capabilities.alive && capabilities.conscious;
  const canFire = capable
    && capabilities.canUseWeapon
    && (unit.infantryCombatRuntime.primaryWeapon?.roundsInWeapon ?? 0) > 0;
  switch (state) {
    case 'capable': return capable;
    case 'incapacitated': return !capable;
    case 'can_fire': return canFire;
    case 'cannot_fire': return !canFire;
    case 'can_move': return capabilities.canMove;
    case 'cannot_move': return !capabilities.canMove;
  }
}

function totalUnitRounds(unit: UnitModel): number {
  const weaponRounds = unit.infantryCombatRuntime.primaryWeapon?.roundsInWeapon ?? 0;
  return Math.max(0, weaponRounds) + unit.infantryCombatRuntime.ammoInventory.reserves.reduce(
    (sum, reserve) => sum + Math.max(0, reserve.rounds),
    0,
  );
}

function resolveRoleUnit(experiment: CombatLabExperimentV1, state: SimulationState, roleId: string): UnitModel | null {
  const unitId = experiment.roles.find((role) => role.roleId === roleId)?.unitId;
  return unitId ? state.units.find((unit) => unit.id === unitId) ?? null : null;
}
function findStepSnapshot(snapshot: CombatLabScenarioRuntimeSnapshotV1, trackId: string, stepId: string): CombatLabStepRuntimeSnapshotV1 | null {
  return snapshot.steps.find((step) => step.trackId === trackId && step.stepId === stepId) ?? null;
}
function hasStepStarted(step: CombatLabStepRuntimeSnapshotV1): boolean {
  return step.startedSeconds !== null || step.state === 'running' || step.state === 'completed' || step.state === 'failed';
}
