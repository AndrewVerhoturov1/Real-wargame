import { serializePhysicalActionCoordinatorState } from '../../actions/PhysicalActionCoordinatorSerialization';
import { serializeUnitPhysicalAction } from '../../actions/PostureTransition';
import {
  serializeInfantryCombatUnitRuntime,
  serializeReferenceProjectileRuntimeState,
} from '../../infantry-combat/runtime';
import { serializeMovementRuntime } from '../../movement/MovementRuntime';
import type { SimulationState } from '../../simulation/SimulationState';

export function digestCombatLabState(state: SimulationState): string {
  const units = [...state.units]
    .sort((left, right) => compareText(left.id, right.id))
    .map((unit) => ({
      id: unit.id,
      side: unit.side,
      position: roundPoint(unit.position),
      facingRadians: round(unit.facingRadians),
      posture: unit.behaviorRuntime.posture,
      stress: round(unit.behaviorRuntime.stress),
      suppression: round(unit.behaviorRuntime.suppression),
      order: unit.order ? stableClone(unit.order) : null,
      movement: serializeMovementRuntime(unit.movementRuntime),
      physicalAction: serializeUnitPhysicalAction(unit.behaviorRuntime.physicalAction),
      coordinator: serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
      infantryCombat: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
    }));
  const projectileRuntime = serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles);
  return digestStableValue({
    schemaVersion: 1,
    simulationTimeSeconds: round(state.simulationTimeSeconds),
    simulationStep: state.simulationStep,
    map: {
      width: state.map.width,
      height: state.map.height,
      metersPerCell: state.map.metersPerCell,
      objects: [...state.map.objects].sort((left, right) => compareText(left.id, right.id)).map(stableClone),
    },
    pressureZones: [...state.pressureZones].sort((left, right) => compareText(left.id, right.id)).map(stableClone),
    units,
    projectileRuntime,
  });
}

export function digestCombatLabEvents(state: SimulationState): string {
  const projectiles = serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles);
  const unitEvents = [...state.units]
    .sort((left, right) => compareText(left.id, right.id))
    .map((unit) => ({
      unitId: unit.id,
      fireResult: unit.infantryCombatRuntime.lastFireResult,
      actionResult: unit.infantryCombatRuntime.ammoInventory.lastActionResult,
      deploymentResults: unit.infantryCombatRuntime.primaryWeapon?.deployment.actionResults ?? [],
      firstAidResult: unit.infantryCombatRuntime.medical.lastFirstAidResult,
      suppressionEventIds: [...unit.infantryCombatRuntime.suppression.appliedEventIds].sort(compareText),
      wounds: unit.infantryCombatRuntime.wounds.slots.map((slot) => ({
        zone: slot.zone,
        severity: slot.severity,
        impactIds: [...slot.impactIds].sort(compareText),
        bleedingState: slot.bleedingState,
        firstAidApplicationCount: slot.firstAidApplicationCount,
      })),
    }));
  return digestStableValue({
    committedShots: projectiles.committedShots,
    impacts: projectiles.impacts,
    terminations: projectiles.terminations,
    diagnostics: {
      emittedNearMissCount: projectiles.diagnostics.emittedNearMissCount,
      emittedNearImpactCount: projectiles.diagnostics.emittedNearImpactCount,
      emittedDirectHitCount: projectiles.diagnostics.emittedDirectHitCount,
      eventOverflowCount: projectiles.diagnostics.eventOverflowCount,
      suppressionEventOverflowCount: projectiles.diagnostics.suppressionEventOverflowCount,
    },
    unitEvents,
  });
}

export function digestStableValue(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  if (typeof value !== 'object' || value === null) {
    if (typeof value === 'number') return Number.isFinite(value) ? round(value) : null;
    return value;
  }
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort(compareText)) {
    const child = record[key];
    if (child !== undefined) normalized[key] = normalizeStable(child);
  }
  return normalized;
}

function stableClone<T>(value: T): T {
  return normalizeStable(value) as T;
}
function roundPoint(point: { x: number; y: number }) {
  return { x: round(point.x), y: round(point.y) };
}
function round(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
