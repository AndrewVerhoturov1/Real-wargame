import type { GridPosition } from '../geometry';
import { contactStageRank, type PerceptionContactMemory } from '../perception/PerceptionContact';
import type { SimulationState } from '../simulation/SimulationState';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import { areUnitsHostile } from '../units/SideRelations';
import type { UnitModel } from '../units/UnitModel';
import { isUnitCombatCapable } from './CombatDamage';
import type { BallisticPoint3 } from './UnitHitShapes';

export interface ResolvedFireTarget {
  contact: PerceptionContactMemory;
  targetUnit: UnitModel;
  aimGridPosition: GridPosition;
  aimHeightMetres: number;
}

export interface FireDecisionResult {
  allowed: boolean;
  reason: string;
  reasonRu: string;
  target: ResolvedFireTarget | null;
}

export function findBestDirectFireContact(
  state: SimulationState,
  shooter: UnitModel,
): PerceptionContactMemory | null {
  return shooter.perceptionKnowledge.contacts
    .filter((contact) => {
      if (!contact.sourceUnitId || !contact.visibleNow) return false;
      if (contact.stage !== 'identified' && contact.stage !== 'confirmed') return false;
      const target = state.units.find((unit) => unit.id === contact.sourceUnitId);
      return Boolean(target && areUnitsHostile(shooter, target) && isUnitCombatCapable(target));
    })
    .sort((left, right) => (
      contactStageRank(right.stage) - contactStageRank(left.stage)
      || right.confidence - left.confidence
      || right.lastUpdatedSeconds - left.lastUpdatedSeconds
    ))[0] ?? null;
}

export function evaluateFireRequest(
  state: SimulationState,
  shooter: UnitModel,
  contactId: string,
): FireDecisionResult {
  if (!isUnitCombatCapable(shooter)) {
    return denied('Shooter is not combat capable.', 'Боец не способен продолжать бой.');
  }
  const contact = shooter.perceptionKnowledge.contacts.find((item) => item.id === contactId) ?? null;
  if (!contact) return denied('Target contact is missing.', 'Контакт цели отсутствует.');
  if (!contact.sourceUnitId) return denied('Contact has no real unit source.', 'Контакт не связан с реальным вражеским бойцом.');
  const targetUnit = state.units.find((unit) => unit.id === contact.sourceUnitId) ?? null;
  if (!targetUnit) return denied('Contact source unit no longer exists.', 'Источник контакта больше не существует.');
  if (!areUnitsHostile(shooter, targetUnit)) return denied('Contact is not hostile.', 'Контакт не является противником.');
  if (!isUnitCombatCapable(targetUnit)) return denied('Target is already out of combat.', 'Цель уже выведена из боя.');
  if (!contact.visibleNow || (contact.stage !== 'identified' && contact.stage !== 'confirmed')) {
    return denied('Direct fire requires a currently identified target.', 'Для прицельного огня цель должна быть опознана сейчас.');
  }
  return {
    allowed: true,
    reason: 'Hostile visible contact is valid for direct fire.',
    reasonRu: 'Видимый вражеский контакт подходит для прицельного огня.',
    target: {
      contact,
      targetUnit,
      aimGridPosition: { ...contact.lastKnownPosition },
      aimHeightMetres: aimHeightForPosture(targetUnit.behaviorRuntime.posture),
    },
  };
}

export function getMuzzlePoint(state: SimulationState, shooter: UnitModel): BallisticPoint3 {
  const ground = getGroundHeightMetres(state, shooter.position);
  const forwardOffsetMetres = shooter.behaviorRuntime.posture === 'prone' ? 0.7 : 0.35;
  return {
    xMetres: shooter.position.x * state.map.metersPerCell + Math.cos(shooter.facingRadians) * forwardOffsetMetres,
    yMetres: shooter.position.y * state.map.metersPerCell + Math.sin(shooter.facingRadians) * forwardOffsetMetres,
    zMetres: ground + muzzleHeightForPosture(shooter.behaviorRuntime.posture),
  };
}

export function getAimPoint(state: SimulationState, target: ResolvedFireTarget): BallisticPoint3 {
  const ground = getGroundHeightMetres(state, target.aimGridPosition);
  return {
    xMetres: target.aimGridPosition.x * state.map.metersPerCell,
    yMetres: target.aimGridPosition.y * state.map.metersPerCell,
    zMetres: ground + target.aimHeightMetres,
  };
}

function denied(reason: string, reasonRu: string): FireDecisionResult {
  return { allowed: false, reason, reasonRu, target: null };
}

function aimHeightForPosture(posture: UnitModel['behaviorRuntime']['posture']): number {
  if (posture === 'prone') return 0.28;
  if (posture === 'crouched') return 0.76;
  return 1.12;
}

function muzzleHeightForPosture(posture: UnitModel['behaviorRuntime']['posture']): number {
  if (posture === 'prone') return 0.31;
  if (posture === 'crouched') return 0.95;
  return 1.45;
}

function getGroundHeightMetres(state: SimulationState, position: GridPosition): number {
  return sampleSmoothHeightLevel(state.map, position.x, position.y) * 2;
}
