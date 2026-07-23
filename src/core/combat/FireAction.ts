import {
  cancelPhysicalAction,
  completePhysicalAction,
  failPhysicalAction,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
  setPhysicalActionCoordinatorDiagnostic,
} from '../actions/PhysicalActionCoordinator';
import type { PhysicalActionHandleV1 } from '../actions/PhysicalActionCoordinatorTypes';
import {
  cancelMovementWeaponPreparation,
  getMovementAimPreparationMultiplier,
  getMovementWeaponPreparation,
  requestMovementWeaponPreparation,
} from '../movement/MovementRuntime';
import { setAttentionMode, setFocusTarget } from '../perception/AttentionController';
import { emitPerceptionSound } from '../perception/PerceptionSound';
import type { SimulationState } from '../simulation/SimulationState';
import { areUnitsHostile } from '../units/SideRelations';
import type { UnitModel } from '../units/UnitModel';
import { traceProjectile, hasFriendlyUnitBeforeDistance, type BallisticRayResult } from './BallisticRaycast';
import { evaluateFireRequest, getAimPoint, getMuzzlePoint } from './CombatDecision';
import { applyUnitHit, getCombatAimMultiplier, isUnitCombatCapable } from './CombatDamage';
import { drainDueCombatEvents, queueCombatEvent } from './CombatEvents';
import { isFireAllowed } from './CombatRules';
import { normalizeDirection, type BallisticDirection3, type BallisticPoint3 } from './UnitHitShapes';
import {
  getWeaponDefinition,
  getWeaponRuntime,
  recoverWeapon,
  tryConsumeRound,
} from './WeaponModel';

export const LEGACY_FIRE_PHYSICAL_ACTION_TYPE = 'legacy_fire_action' as const;

export type FireActionPhase =
  | 'acquire_target'
  | 'turning'
  | 'readying_weapon'
  | 'aiming'
  | 'final_safety_check'
  | 'firing'
  | 'recovering'
  | 'failed'
  | 'cancelled';

export interface FireActionState {
  id: string;
  contactId: string;
  physicalActionHandle: PhysicalActionHandleV1;
  phase: FireActionPhase;
  startedSeconds: number;
  phaseStartedSeconds: number;
  accumulatedAimQuality: number;
  shotSequence: number;
  reason: string;
  reasonRu: string;
}

export interface LastShotResult {
  shotId: string;
  result: BallisticRayResult;
  firedSeconds: number;
}

const actionByUnit = new WeakMap<UnitModel, FireActionState>();
const lastShotByUnit = new WeakMap<UnitModel, LastShotResult>();

export function requestFireAction(state: SimulationState, unit: UnitModel, contactId: string): boolean {
  if (!isFireAllowed(state)) {
    unit.behaviorRuntime.reason = 'Стрельба запрещена общим переключателем.';
    unit.behaviorRuntime.lastEvent = 'combat_fire_permission_denied';
    return false;
  }
  if (actionByUnit.has(unit) || !isUnitCombatCapable(unit)) return false;
  const ownerToken = fireIntentOwnerToken(contactId);
  const decision = evaluateFireRequest(state, unit, contactId);
  if (!decision.allowed) {
    cancelMovementWeaponPreparation(unit, { ownerToken });
    unit.behaviorRuntime.reason = decision.reasonRu;
    unit.behaviorRuntime.lastEvent = 'combat_fire_request_denied';
    return false;
  }
  const movementPermission = requestMovementWeaponPreparation(state, unit, { contactId, ownerToken });
  if (!movementPermission.allowed) {
    unit.behaviorRuntime.reason = movementPermission.reasonRu;
    unit.behaviorRuntime.lastEvent = 'movement_weapon_preparation_required';
    return false;
  }
  const physicalAction = requestPhysicalActionChannels(unit, {
    actionType: LEGACY_FIRE_PHYSICAL_ACTION_TYPE,
    owner: { source: 'system', id: contactId },
    ownerToken,
    channels: ['weapon'],
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'legacy_fire_action_started',
    reasonRu: 'Старый огневой механизм занял канал оружия.',
  });
  if (!physicalAction.accepted || !physicalAction.handle) {
    unit.behaviorRuntime.reason = physicalAction.reasonRu;
    unit.behaviorRuntime.lastEvent = 'combat_fire_physical_action_blocked';
    return false;
  }
  actionByUnit.set(unit, {
    id: `${unit.id}:fire:${Math.round(state.simulationTimeSeconds * 1000)}`,
    contactId,
    physicalActionHandle: { ...physicalAction.handle },
    phase: 'acquire_target',
    startedSeconds: state.simulationTimeSeconds,
    phaseStartedSeconds: state.simulationTimeSeconds,
    accumulatedAimQuality: 0,
    shotSequence: 0,
    reason: 'Fire action started.',
    reasonRu: 'Начато наведение на цель.',
  });
  unit.behaviorRuntime.currentAction = 'aim';
  unit.behaviorRuntime.reason = 'Начато наведение на цель.';
  unit.behaviorRuntime.lastEvent = 'combat_fire_action_started';
  return true;
}

export function cancelPendingFireIntent(unit: UnitModel, contactId?: string): boolean {
  const pending = getMovementWeaponPreparation(unit);
  if (!pending) return false;
  if (contactId && pending.contactId !== contactId) return false;
  return cancelMovementWeaponPreparation(unit, {
    ownerToken: pending.ownerToken,
    revision: pending.revision,
    contactId: pending.contactId,
  });
}

export function reconcilePendingFireIntent(state: SimulationState, unit: UnitModel): void {
  const pending = getMovementWeaponPreparation(unit);
  if (!pending) return;
  const expected = { ownerToken: pending.ownerToken, revision: pending.revision, contactId: pending.contactId };
  if (pending.orderIssuedAtMs !== (unit.order?.issuedAtMs ?? null)) {
    cancelMovementWeaponPreparation(unit, expected);
    return;
  }
  if (!isFireAllowed(state) || !isUnitCombatCapable(unit)) {
    cancelMovementWeaponPreparation(unit, expected);
    return;
  }
  const decision = evaluateFireRequest(state, unit, pending.contactId);
  if (!decision.allowed || !decision.target) cancelMovementWeaponPreparation(unit, expected);
}

export function reconcileAllPendingFireIntents(state: SimulationState): void {
  for (const unit of state.units) reconcilePendingFireIntent(state, unit);
}

export function getFireAction(unit: UnitModel): FireActionState | null {
  const action = actionByUnit.get(unit);
  return action ? { ...action, physicalActionHandle: { ...action.physicalActionHandle } } : null;
}

export function getLastShotResult(unit: UnitModel): LastShotResult | null {
  const result = lastShotByUnit.get(unit);
  return result ? { ...result, result: { ...result.result, impactPoint: { ...result.result.impactPoint } } } : null;
}

export function cancelFireAction(unit: UnitModel, reason: string, reasonRu = reason): void {
  const action = actionByUnit.get(unit);
  if (!action) return;
  cancelMovementWeaponPreparation(unit, { ownerToken: fireIntentOwnerToken(action.contactId) });
  action.phase = 'cancelled';
  action.reason = reason;
  action.reasonRu = reasonRu;
  if (getPhysicalActionLease(unit, action.physicalActionHandle)) {
    cancelPhysicalAction(unit, action.physicalActionHandle, {
      endedSeconds: action.phaseStartedSeconds,
      resultCode: 'legacy_fire_action_cancelled',
      resultRu: reasonRu,
    });
  }
  actionByUnit.delete(unit);
  unit.behaviorRuntime.currentAction = 'observe';
  unit.behaviorRuntime.reason = reasonRu;
  unit.behaviorRuntime.lastEvent = 'combat_fire_action_cancelled';
}

export function tickFireAction(state: SimulationState, unit: UnitModel, deltaSeconds: number): void {
  processDueCombatEvents(state);
  recoverWeapon(unit, deltaSeconds);
  const action = actionByUnit.get(unit);
  if (!action || deltaSeconds <= 0) return;
  if (!getPhysicalActionLease(unit, action.physicalActionHandle)) {
    action.phase = 'failed';
    action.reason = 'Physical weapon lease was lost.';
    action.reasonRu = 'Огневое действие остановлено: захват канала оружия потерян.';
    actionByUnit.delete(unit);
    setPhysicalActionCoordinatorDiagnostic(unit, 'legacy_fire_action_lease_lost', action.reasonRu);
    unit.behaviorRuntime.currentAction = 'observe';
    unit.behaviorRuntime.reason = action.reasonRu;
    unit.behaviorRuntime.lastEvent = 'combat_fire_action_failed';
    return;
  }
  if (!isFireAllowed(state) && action.phase !== 'recovering') {
    cancelFireAction(unit, 'Fire permission was disabled.', 'Стрельба запрещена до выстрела.');
    return;
  }
  if (!isUnitCombatCapable(unit)) {
    cancelFireAction(unit, 'Shooter is no longer combat capable.', 'Боец больше не способен вести огонь.');
    return;
  }

  const decision = evaluateFireRequest(state, unit, action.contactId);
  if (!decision.allowed || !decision.target) {
    failAction(state, unit, action, decision.reason, decision.reasonRu);
    return;
  }

  switch (action.phase) {
    case 'acquire_target': {
      const target = decision.target.aimGridPosition;
      const bearing = Math.atan2(target.y - unit.position.y, target.x - unit.position.x);
      setFocusTarget(unit, action.contactId, bearing);
      setAttentionMode(unit, 'engage', 'automatic');
      transition(action, 'turning', state.simulationTimeSeconds, 'Turning toward target.', 'Поворот к цели.');
      unit.behaviorRuntime.currentAction = 'aim';
      return;
    }
    case 'turning': {
      const target = decision.target.aimGridPosition;
      const desired = Math.atan2(target.y - unit.position.y, target.x - unit.position.x);
      const remaining = signedAngle(desired - unit.facingRadians);
      const step = 2.8 * deltaSeconds;
      if (Math.abs(remaining) <= Math.max(0.025, step)) {
        unit.facingRadians = normalizeRadians(desired);
        transition(action, 'readying_weapon', state.simulationTimeSeconds, 'Facing target.', 'Боец повернулся к цели.');
      } else {
        unit.facingRadians = normalizeRadians(unit.facingRadians + Math.sign(remaining) * step);
      }
      return;
    }
    case 'readying_weapon': {
      const definition = getWeaponDefinition(getWeaponRuntime(unit).weaponId);
      if (elapsed(action, state) >= definition.readyTimeSeconds) {
        transition(action, 'aiming', state.simulationTimeSeconds, 'Weapon ready.', 'Оружие подготовлено.');
      }
      return;
    }
    case 'aiming': {
      const definition = getWeaponDefinition(getWeaponRuntime(unit).weaponId);
      const skill = Math.max(0.35, unit.soldier.traits.weaponSkill / 70);
      const stability = postureAimFactor(unit) * getCombatAimMultiplier(unit);
      const impairment = 1 + unit.behaviorRuntime.suppression / 80 + unit.behaviorRuntime.stress / 180;
      const movementPreparation = getMovementAimPreparationMultiplier(state, unit);
      const required = definition.aimTimeSeconds * impairment * movementPreparation / Math.max(0.2, skill * stability);
      action.accumulatedAimQuality = Math.max(0, Math.min(1, elapsed(action, state) / Math.max(0.05, required)));
      unit.behaviorRuntime.currentAction = 'aim';
      unit.behaviorRuntime.reason = `Наведение: ${Math.round(action.accumulatedAimQuality * 100)}%.`;
      if (action.accumulatedAimQuality >= 1) {
        transition(action, 'final_safety_check', state.simulationTimeSeconds, 'Aim complete.', 'Наведение завершено.');
      }
      return;
    }
    case 'final_safety_check': {
      const geometry = buildShotGeometry(state, unit, decision.target, action, false);
      const friendlyIds = new Set(state.units.filter((candidate) => !areUnitsHostile(unit, candidate)).map((candidate) => candidate.id));
      const friendly = hasFriendlyUnitBeforeDistance(state, geometry.input, friendlyIds, geometry.targetDistanceMetres);
      if (friendly) {
        failAction(state, unit, action, 'Friendly unit crosses the line of fire.', 'Союзник пересекает линию огня.');
        return;
      }
      transition(action, 'firing', state.simulationTimeSeconds, 'Safety check passed.', 'Линия огня свободна.');
      return;
    }
    case 'firing': {
      executeShot(state, unit, action, decision.target);
      if (actionByUnit.has(unit)) {
        transition(action, 'recovering', state.simulationTimeSeconds, 'Shot fired.', 'Выстрел произведён.');
      }
      return;
    }
    case 'recovering': {
      const definition = getWeaponDefinition(getWeaponRuntime(unit).weaponId);
      if (elapsed(action, state) >= definition.recoveryTimeSeconds) {
        completePhysicalAction(unit, action.physicalActionHandle, {
          endedSeconds: state.simulationTimeSeconds,
          resultCode: 'legacy_fire_action_completed',
          resultRu: 'Старое огневое действие завершено.',
        });
        actionByUnit.delete(unit);
        unit.behaviorRuntime.currentAction = 'observe';
        unit.behaviorRuntime.reason = 'Выстрел завершён, боец снова наблюдает.';
        unit.behaviorRuntime.lastEvent = 'combat_fire_action_completed';
      }
      return;
    }
    case 'failed':
    case 'cancelled':
    default:
      actionByUnit.delete(unit);
  }
}

export function tickAllFireActions(state: SimulationState, deltaSeconds: number): void {
  processDueCombatEvents(state);
  for (const unit of state.units) tickFireAction(state, unit, deltaSeconds);
  processDueCombatEvents(state);
}

export function processDueCombatEvents(state: SimulationState): void {
  const due = drainDueCombatEvents(state);
  for (const event of due) {
    if (event.kind !== 'projectile_impact' || event.hitType !== 'unit' || !event.hitUnitId || !event.hitZone) continue;
    const target = state.units.find((unit) => unit.id === event.hitUnitId);
    if (!target) continue;
    applyUnitHit(target, {
      shotId: event.shotId,
      zone: event.hitZone,
      energyJoules: event.energyJoules,
    });
    queueCombatEvent(state, {
      id: `${event.shotId}:unit-hit`,
      kind: 'unit_hit',
      dueSeconds: state.simulationTimeSeconds,
      shotId: event.shotId,
      shooterId: event.shooterId,
      targetId: target.id,
      zone: event.hitZone,
      energyJoules: event.energyJoules,
    });
  }
}

function executeShot(
  state: SimulationState,
  unit: UnitModel,
  action: FireActionState,
  target: NonNullable<ReturnType<typeof evaluateFireRequest>['target']>,
): void {
  const weapon = getWeaponRuntime(unit);
  const definition = getWeaponDefinition(weapon.weaponId);
  if (!tryConsumeRound(unit, state.simulationTimeSeconds)) {
    failAction(state, unit, action, 'Weapon cannot fire now.', 'Оружие сейчас не может выстрелить.');
    return;
  }
  const geometry = buildShotGeometry(state, unit, target, action, true);
  const result = traceProjectile(state, geometry.input);
  action.shotSequence += 1;
  lastShotByUnit.set(unit, { shotId: geometry.input.shotId, result, firedSeconds: state.simulationTimeSeconds });
  queueCombatEvent(state, {
    id: `${geometry.input.shotId}:fired`,
    kind: 'shot_fired',
    dueSeconds: state.simulationTimeSeconds,
    shotId: geometry.input.shotId,
    shooterId: unit.id,
    weaponId: definition.id,
    origin: geometry.input.origin,
  });
  queueCombatEvent(state, {
    id: `${geometry.input.shotId}:impact`,
    kind: 'projectile_impact',
    dueSeconds: state.simulationTimeSeconds + result.flightTimeSeconds,
    shotId: geometry.input.shotId,
    shooterId: unit.id,
    hitType: result.hitType,
    impactPoint: result.impactPoint,
    hitObjectId: result.hitObjectId,
    hitUnitId: result.hitUnitId,
    hitZone: result.hitZone,
    energyJoules: 3000,
  });
  emitPerceptionSound(state, {
    id: `${geometry.input.shotId}:sound`,
    kind: 'rifle_shot',
    sourceId: unit.id,
    labelRu: 'Винтовочный выстрел',
    position: { ...unit.position },
    loudness: definition.soundLoudness,
    createdSeconds: state.simulationTimeSeconds,
    durationSeconds: 0.8,
  });
  unit.behaviorRuntime.currentAction = 'fire';
  unit.behaviorRuntime.reason = result.hitType === 'unit' ? 'Произведён выстрел по цели.' : 'Произведён выстрел, попадание не подтверждено.';
  unit.behaviorRuntime.lastEvent = 'combat_shot_fired';
}

function buildShotGeometry(
  state: SimulationState,
  unit: UnitModel,
  target: NonNullable<ReturnType<typeof evaluateFireRequest>['target']>,
  action: FireActionState,
  includeError: boolean,
): {
  input: Parameters<typeof traceProjectile>[1];
  targetDistanceMetres: number;
} {
  const weapon = getWeaponRuntime(unit);
  const definition = getWeaponDefinition(weapon.weaponId);
  const origin = getMuzzlePoint(state, unit);
  const aim = getAimPoint(state, target);
  const dx = aim.xMetres - origin.xMetres;
  const dy = aim.yMetres - origin.yMetres;
  const dz = aim.zMetres - origin.zMetres;
  const targetDistanceMetres = Math.hypot(dx, dy, dz);
  const baseDirection = normalizeDirection({ x: dx, y: dy, z: dz });
  const shotId = `${action.id}:shot:${action.shotSequence + 1}`;
  const direction = includeError
    ? applyAimError(baseDirection, computeAimErrorRadians(unit, targetDistanceMetres, target.contact.uncertaintyCells * state.map.metersPerCell, action), shotId)
    : baseDirection;
  return {
    input: {
      shotId,
      shooterId: unit.id,
      origin,
      direction,
      maximumDistanceMetres: definition.maximumRangeMetres,
      muzzleVelocityMetresPerSecond: definition.muzzleVelocityMetresPerSecond,
    },
    targetDistanceMetres,
  };
}

function computeAimErrorRadians(
  unit: UnitModel,
  distanceMetres: number,
  uncertaintyMetres: number,
  action: FireActionState,
): number {
  const weapon = getWeaponRuntime(unit);
  const definition = getWeaponDefinition(weapon.weaponId);
  const skillFactor = Math.max(0.35, unit.soldier.traits.weaponSkill / 70);
  const postureFactor = unit.behaviorRuntime.posture === 'prone' ? 0.55 : unit.behaviorRuntime.posture === 'crouched' ? 0.78 : 1;
  const impairment = 1 + unit.behaviorRuntime.suppression / 45 + unit.behaviorRuntime.stress / 90 + weapon.currentRecoil;
  const contactError = Math.atan2(Math.max(0, uncertaintyMetres) * 0.35, Math.max(1, distanceMetres));
  const aimFactor = 1.25 - Math.max(0, Math.min(1, action.accumulatedAimQuality));
  return (definition.baseDispersionRadians * impairment * postureFactor * aimFactor) / skillFactor + contactError;
}

function applyAimError(direction: BallisticDirection3, errorRadians: number, shotId: string): BallisticDirection3 {
  const yaw = deterministicSigned(`${shotId}:yaw`) * errorRadians;
  const pitch = deterministicSigned(`${shotId}:pitch`) * errorRadians * 0.65;
  const baseYaw = Math.atan2(direction.y, direction.x);
  const horizontal = Math.hypot(direction.x, direction.y);
  const basePitch = Math.atan2(direction.z, horizontal);
  const nextYaw = baseYaw + yaw;
  const nextPitch = basePitch + pitch;
  const horizontalAfter = Math.cos(nextPitch);
  return normalizeDirection({
    x: Math.cos(nextYaw) * horizontalAfter,
    y: Math.sin(nextYaw) * horizontalAfter,
    z: Math.sin(nextPitch),
  });
}

function transition(
  action: FireActionState,
  phase: FireActionPhase,
  nowSeconds: number,
  reason: string,
  reasonRu: string,
): void {
  action.phase = phase;
  action.phaseStartedSeconds = nowSeconds;
  action.reason = reason;
  action.reasonRu = reasonRu;
}

function failAction(
  state: SimulationState,
  unit: UnitModel,
  action: FireActionState,
  reason: string,
  reasonRu: string,
): void {
  action.phase = 'failed';
  action.reason = reason;
  action.reasonRu = reasonRu;
  if (getPhysicalActionLease(unit, action.physicalActionHandle)) {
    failPhysicalAction(unit, action.physicalActionHandle, {
      endedSeconds: state.simulationTimeSeconds,
      resultCode: 'legacy_fire_action_failed',
      resultRu: reasonRu,
    });
  }
  actionByUnit.delete(unit);
  unit.behaviorRuntime.currentAction = 'observe';
  unit.behaviorRuntime.reason = reasonRu;
  unit.behaviorRuntime.lastEvent = 'combat_fire_action_failed';
}

function elapsed(action: FireActionState, state: SimulationState): number {
  return Math.max(0, state.simulationTimeSeconds - action.phaseStartedSeconds);
}

function postureAimFactor(unit: UnitModel): number {
  if (unit.behaviorRuntime.posture === 'prone') return 1.3;
  if (unit.behaviorRuntime.posture === 'crouched') return 1.12;
  return 1;
}

function signedAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function normalizeRadians(value: number): number {
  const full = Math.PI * 2;
  const normalized = value % full;
  return normalized < 0 ? normalized + full : normalized;
}

function deterministicSigned(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}

function fireIntentOwnerToken(contactId: string): string {
  return `fire-intent:${contactId}`;
}
