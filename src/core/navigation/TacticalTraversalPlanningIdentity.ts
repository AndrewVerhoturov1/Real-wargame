import type { PreparedAwarenessWorldSnapshot } from '../../runtime/AwarenessWorldRuntime';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { TacticalTraversalFieldView } from './TacticalTraversalFieldView';
import { hashTraversalRoute } from './TacticalTraversalPlan';
import {
  createDefaultTacticalTraversalProfile,
  normalizeTacticalTraversalProfile,
  type TacticalTraversalProfile,
} from './TacticalTraversalProfile';

export interface TacticalTraversalStableInput {
  readonly identity: string;
  readonly routeRevision: number;
  readonly routeHash: string;
  readonly commandId: string | null;
  readonly commandRevision: number;
  readonly intentPresetId: string;
  readonly intentVersion: number;
  readonly baseMovementProfileId: string;
  readonly knowledgeRevision: number;
  readonly settingsRevision: number;
  readonly traversalProfile: TacticalTraversalProfile;
  readonly movementProfileRevision: number;
}

export function captureTacticalTraversalStableInput(
  state: SimulationState,
  unit: UnitModel,
): TacticalTraversalStableInput {
  const order = unit.order!;
  const routeCells = order.routeCells ?? [];
  const command = unit.playerCommand && (!order.playerCommandId || unit.playerCommand.id === order.playerCommandId)
    ? unit.playerCommand
    : null;
  const profile = readUnitTacticalTraversalProfile(unit);
  const routeRevision = revision(order.routeRevision, 1);
  const routeHash = hashTraversalRoute(routeCells);
  const commandId = order.playerCommandId ?? command?.id ?? order.ownerToken ?? null;
  const commandRevision = revision(command?.revision ?? order.movementProfileSelectionRevision, 0);
  const intentPresetId = command?.intent.presetId ?? 'move';
  const intentVersion = revision(command?.intent.formatVersion, 1);
  const baseMovementProfileId = order.traversalBaseMovementProfileId
    ?? command?.intent.movementProfileId
    ?? order.movementProfileId
    ?? 'normal_walk';
  const knowledgeRevision = revision(unit.tacticalKnowledge.revision, 0);
  const settingsRevision = revision(unit.tacticalPositionSettingsRevision, 0);
  const movementProfileRevision = revision(state.movementProfiles.revision, 0);
  const identity = [
    `unit:${unit.id}`,
    `order:${order.issuedAtMs}:${order.ownerToken ?? '-'}`,
    `route:${routeRevision}:${routeHash}`,
    `command:${commandId ?? '-'}:${commandRevision}`,
    `intent:${intentVersion}:${intentPresetId}:${baseMovementProfileId}`,
    `knowledge:${knowledgeRevision}`,
    `position-settings:${settingsRevision}`,
    `traversal-profile:${profile.id}:${profile.revision}`,
    `movement-profiles:${movementProfileRevision}`,
  ].join('|');
  return {
    identity,
    routeRevision,
    routeHash,
    commandId,
    commandRevision,
    intentPresetId,
    intentVersion,
    baseMovementProfileId,
    knowledgeRevision,
    settingsRevision,
    traversalProfile: profile,
    movementProfileRevision,
  };
}

export function readUnitTacticalTraversalProfile(unit: UnitModel): TacticalTraversalProfile {
  const candidate = (unit as UnitModel & { tacticalTraversalProfile?: TacticalTraversalProfile })
    .tacticalTraversalProfile;
  return normalizeTacticalTraversalProfile(candidate ?? createDefaultTacticalTraversalProfile());
}

export function buildTacticalTraversalFieldView(
  prepared: PreparedAwarenessWorldSnapshot,
): TacticalTraversalFieldView {
  const field = prepared.field;
  return {
    width: field.width,
    height: field.height,
    metersPerCell: field.metersPerCell,
    passable: field.passable,
    movementCost: field.movementCost,
    danger: field.danger,
    suppression: field.suppression,
    concealment: field.concealment,
    safety: field.safety,
    expectedProtectionAgainstThreat: field.expectedProtectionAgainstThreat,
    uncertainty: field.uncertainty,
    reverseSlopeQuality: field.reverseSlopeQuality,
    forwardSlopeRisk: field.forwardSlopeRisk,
    staticProtectionByPosture: {
      standing: field.staticProtectionStanding,
      crouched: field.staticProtectionCrouched,
      prone: field.staticProtectionProne,
    },
    protectedThreatIndex: field.protectedThreatIndex,
    threatIds: field.threatIds,
  };
}

function revision(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}
